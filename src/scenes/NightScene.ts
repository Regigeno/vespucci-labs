import type { Game, Scene } from "../game";
import type { VoiceHandle } from "../audio/AudioEngine";
import { NIGHT_ONE } from "../sim/config";
import { NightSim } from "../sim/night";
import { AGENT_NAMES, type AgentId, type NodeId, type SimEvent } from "../sim/types";
import { AmosDirector, type DirectorContext } from "../script/amos";
import { GptScript } from "../script/gpt";
import { OfficeView } from "../night/OfficeView";
import { PAGES, Terminal, type TerminalPage } from "../night/Terminal";
import { Hud } from "../night/Hud";
import { ALL_FEED_IMAGES } from "../night/cameras";
import { asset, el, img, preload } from "../ui/dom";

export interface NightOutcome {
  result: "dawn" | "breach";
  clock: string;
  agent: AgentId | null;
  linksCompleted: number;
  contactsMissed: number;
  sealShuts: number;
  peakHeat: number;
}

type Ending = { kind: "breach" | "dawn"; t: number; fired: Set<string> };

const FIRST_CONTACT_LATEST = 115;

export class NightScene implements Scene {
  readonly root: HTMLElement;
  private readonly sim = new NightSim(NIGHT_ONE);
  private readonly director = new AmosDirector();
  private readonly gpt = new GptScript();
  private readonly office: OfficeView;
  private readonly terminal: Terminal;
  private readonly hud: Hud;
  private readonly jumpscare: HTMLElement;
  private readonly dawnOverlay: HTMLElement;

  private holdKey = false;
  private holdPointer = false;
  private pendingSeal: "shut" | "open" | null = null;
  private voice: VoiceHandle | null = null;
  private voiceLineId: string | null = null;
  private callSeconds = 0;
  private pulseTimer = 0;
  private sashaAt: number | null = null;
  private ending: Ending | null = null;
  private readonly stats = { sealShuts: 0, peakHeat: 0 };

  constructor(private readonly game: Game) {
    this.office = new OfficeView(
      () => this.setTerminal(true),
      () => this.answerPhone(),
    );
    this.terminal = new Terminal({
      onPage: (page) => this.setPage(page),
      onCamera: (node) => this.setCamera(node),
      onSealToggle: () => this.toggleSeal(),
      onHold: (active) => (this.holdPointer = active),
      onLower: () => this.setTerminal(false),
    });
    this.hud = new Hud(
      () => this.answerPhone(),
      (id) => this.director.choose(id),
    );
    this.jumpscare = el("div", "jumpscare", [img(asset("jumpscare_gpt.jpg"))]);
    this.dawnOverlay = el("div", "dawn-overlay", [
      el("div", "dawn-time", ["6:00 AM"]),
      el("div", "dawn-sub", ["Shift complete"]),
    ]);

    this.root = el("div", "scene night", [this.office.root, this.terminal.root, this.hud.root, this.dawnOverlay, this.jumpscare]);

    this.root.addEventListener("pointermove", (e) => {
      const p = this.game.toStage(e.clientX, e.clientY);
      this.office.look(p.x, p.y);
    });
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);

    if (game.params.debug) (window as unknown as { __night: NightScene }).__night = this;
  }

  enter(): void {
    void preload([...ALL_FEED_IMAGES, "jumpscare_gpt.jpg", "seal_texture.jpg"]);
    this.game.audio.setRain(0.7, true, 2);
    this.game.audio.setHum(1, 2);
    this.terminal.setCamera("cell_gpt");
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  exit(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.voice?.stop();
    this.game.audio.setRinging(false);
  }

  /** Read-only snapshot for automated tests and debugging. */
  get debugState() {
    return {
      sim: this.sim.state,
      terminalOpen: this.terminal.open,
      page: this.terminal.page,
      camera: this.terminal.camera,
      call: this.director.call,
      line: this.director.speaking?.line.id ?? null,
      choice: this.director.pendingChoice?.line.id ?? null,
    };
  }

  update(dt: number): void {
    const s = this.sim.state;

    if (!this.ending) {
      if (
        !this.director.tutorialComplete &&
        s.gpt.contactsOpened === 0 &&
        s.elapsed < FIRST_CONTACT_LATEST &&
        s.gpt.nextContactAt - s.elapsed < 2
      ) {
        this.sim.deferNextContact(dt);
      }

      const holdLink =
        (this.holdKey || this.holdPointer) && this.terminal.open && this.terminal.page === "comms" && s.gpt.contact !== null;
      const events = this.sim.tick(dt, { holdLink, sealCommand: this.pendingSeal });
      this.pendingSeal = null;
      for (const event of events) this.handle(event);

      if (this.sashaAt !== null && s.elapsed >= this.sashaAt) {
        this.sashaAt = null;
        this.director.notify({ type: "gptMentionedSasha" }, this.ctx());
      }
    }

    this.stats.peakHeat = Math.max(this.stats.peakHeat, s.seal.heat);
    this.director.update(dt, this.ctx());
    this.syncPhone(dt);

    if (s.gpt.linkProgress > 0) {
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 0.5;
        this.game.audio.linkPulse(s.gpt.linkProgress / this.sim.config.gpt.linkHold);
      }
    } else {
      this.pulseTimer = 0;
    }

    const contact = s.gpt.contact;
    this.terminal.render(dt, {
      elapsed: s.elapsed,
      secondsPerHour: this.sim.config.secondsPerHour,
      clock: this.sim.clock,
      locations: s.locations,
      seal: s.seal,
      relockBelow: this.sim.config.seal.relockBelow,
      heatGainShut: this.sim.config.seal.heatGainShut,
      coolOpen: this.sim.config.seal.coolOpen,
      contact: contact ? { remaining: Math.max(0, contact.deadline - s.elapsed), total: contact.deadline - contact.openedAt } : null,
      linkProgress: s.gpt.linkProgress,
      linkHold: this.sim.config.gpt.linkHold,
      linkLine: this.gpt.duringLink(s.gpt.linkProgress, this.sim.config.gpt.linkHold),
      log: s.log,
    });

    this.office.update(dt, {
      sealShut: s.seal.shut,
      forcedOpen: s.seal.forcedOpen,
      heat: s.seal.heat,
      gptInAirlock: s.locations.gpt === "airlock",
      ringing: this.director.ringing,
      onCall: this.director.call === "connected",
      contactOpen: contact !== null,
      terminalOpen: this.terminal.open,
    });

    this.hud.update(dt, {
      clock: this.ending?.kind === "dawn" ? "6:00 AM" : this.sim.clock,
      sealShut: s.seal.shut,
      forcedOpen: s.seal.forcedOpen,
      heat: s.seal.heat,
      ringing: this.director.ringing,
      onCall: this.director.call === "connected",
      callSeconds: this.callSeconds,
      amosTalking: this.director.speaking !== null,
      contactRemaining: contact ? Math.max(0, contact.deadline - s.elapsed) : null,
      commsVisible: this.terminal.open && this.terminal.page === "comms",
    });

    if (this.ending) this.updateEnding(dt);
  }

  // ------------------------------------------------------------------ events

  private handle(event: SimEvent): void {
    const audio = this.game.audio;
    const s = this.sim.state;
    switch (event.type) {
      case "contactOpened": {
        audio.chime();
        const line = this.gpt.opener(s.locations.gpt);
        this.terminal.addTranscript("gpt", line.text, s.elapsed);
        if (line.mentionsSasha) this.sashaAt = s.elapsed + 3;
        break;
      }
      case "linkBroken":
        audio.linkBroken();
        this.terminal.addTranscript("sys", "Link dropped. Progress lost.", s.elapsed);
        break;
      case "linkCompleted":
        audio.linkComplete();
        this.terminal.addTranscript("sys", "Link maintained. Contact closed.", s.elapsed);
        this.terminal.addTranscript("gpt", this.gpt.afterLink(event.from !== event.to), s.elapsed);
        break;
      case "contactMissed":
        audio.staticBurst(0.45, 0.08);
        this.terminal.addTranscript("sys", "No response. Contact closed.", s.elapsed);
        this.terminal.addTranscript("gpt", this.gpt.missed(), s.elapsed);
        break;
      case "agentMoved":
        this.terminal.flagMovement([event.from, event.to]);
        if (event.to !== "office") {
          audio.distantStep();
          this.office.bump(0.15);
        }
        break;
      case "entryBlocked":
        audio.bang();
        this.office.bump(1.1);
        this.hud.showToast("IMPACT ON SEAL · ENTRY BLOCKED", 2.5);
        break;
      case "sealShut":
        this.stats.sealShuts += 1;
        audio.sealClank(true);
        this.office.bump(0.35);
        break;
      case "sealOpened":
        audio.sealClank(false);
        break;
      case "sealRejected":
        audio.sealRejected();
        this.hud.showToast(event.reason === "forcedOpen" ? "SEAL LOCKED OUT · COOLING BELOW 40%" : "SEAL CONTROLS LOCKED DURING LINK");
        break;
      case "sealForcedOpen":
        audio.alarm();
        audio.sealClank(false);
        this.office.bump(0.5);
        this.hud.showToast("THERMAL LIMIT · SEAL FORCED OPEN", 3);
        break;
      case "sealRelockable":
        audio.keycard(true);
        this.hud.showToast("SEAL COOLED · LOCK AVAILABLE");
        break;
      case "heatWarning":
        audio.sealRejected();
        this.hud.showToast("SEAL HEAT CRITICAL");
        break;
      case "breach":
        this.startEnding("breach");
        break;
      case "dawn":
        this.startEnding("dawn");
        break;
      default:
        break;
    }
    this.director.notify(event, this.ctx());
  }

  private ctx(): DirectorContext {
    const s = this.sim.state;
    return { gptLocation: s.locations.gpt, sealShut: s.seal.shut, heat: s.seal.heat };
  }

  private syncPhone(dt: number): void {
    const audio = this.game.audio;
    audio.setRinging(this.director.ringing && !this.ending);
    if (this.director.call === "connected") this.callSeconds += dt;

    const speaking = this.director.speaking;
    const id = speaking?.line.id ?? null;
    if (id !== this.voiceLineId) {
      this.voice?.stop();
      this.voice = speaking ? audio.speak(speaking.line.speaker, speaking.remaining / this.game.params.speed) : null;
      this.voiceLineId = id;
    }
    this.hud.setLine(this.ending?.kind === "breach" ? null : (speaking?.line ?? null));
    const pending = this.director.pendingChoice;
    this.hud.setChoices(pending?.line.id ?? null, pending?.choices ?? null);
  }

  // ------------------------------------------------------------------ input

  private answerPhone(): void {
    if (!this.director.ringing || this.ending) return;
    this.game.audio.phonePickup();
    this.director.notify({ type: "phoneAnswered" }, this.ctx());
  }

  private setTerminal(open: boolean): void {
    if (this.ending || open === this.terminal.open) return;
    if (!open && this.sim.linkActive) return;
    if (open) {
      this.office.root.style.transformOrigin = this.office.monitorOrigin();
      this.game.audio.terminalOn();
      this.director.notify({ type: "terminalOpened" }, this.ctx());
      if (this.terminal.page === "cameras") this.viewCamera(this.terminal.camera);
    } else {
      this.game.audio.terminalOff();
      this.holdPointer = false;
    }
    this.terminal.setOpen(open);
    this.office.root.classList.toggle("zoomed", open);
  }

  private setPage(page: TerminalPage): void {
    if (!this.terminal.open || this.ending) return;
    if (this.sim.linkActive && page !== "comms") {
      this.game.audio.sealRejected();
      return;
    }
    if (page === this.terminal.page) return;
    this.game.audio.click();
    this.terminal.setPage(page);
    if (page === "cameras") this.viewCamera(this.terminal.camera);
  }

  private setCamera(node: NodeId): void {
    if (this.ending) return;
    this.game.audio.staticBurst(0.14, 0.05);
    this.terminal.setCamera(node);
    this.terminal.cut();
    this.viewCamera(node);
  }

  private viewCamera(node: NodeId): void {
    this.director.notify({ type: "cameraViewed", node }, this.ctx());
  }

  private toggleSeal(): void {
    if (!this.terminal.open || this.ending) return;
    this.pendingSeal = this.sim.state.seal.shut ? "open" : "shut";
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat && e.key !== "f" && e.key !== "F") return;
    const key = e.key.toLowerCase();
    if (key === " ") {
      e.preventDefault();
      this.setTerminal(!this.terminal.open);
    } else if (key === "escape") {
      this.setTerminal(false);
    } else if (key >= "1" && key <= "4") {
      if (!this.terminal.open) this.setTerminal(true);
      this.setPage(PAGES[Number(key) - 1]);
    } else if (key === "s") {
      this.toggleSeal();
    } else if (key === "f") {
      this.holdKey = true;
    } else if (key === "e") {
      this.answerPhone();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key.toLowerCase() === "f") this.holdKey = false;
  }

  private onBlur(): void {
    this.holdKey = false;
    this.holdPointer = false;
  }

  // ------------------------------------------------------------------ endings

  private startEnding(kind: "breach" | "dawn"): void {
    this.ending = { kind, t: 0, fired: new Set() };
    this.holdKey = false;
    this.holdPointer = false;
    this.terminal.setOpen(false);
    this.office.root.classList.remove("zoomed");
    this.root.classList.add(`ending-${kind}`);
    const audio = this.game.audio;
    if (kind === "breach") {
      this.voice?.stop();
      audio.setHum(0, 0.2);
      audio.bang();
      this.office.bump(1.4);
    } else {
      audio.dawnBells();
      this.dawnOverlay.classList.add("show");
    }
  }

  private updateEnding(dt: number): void {
    const ending = this.ending!;
    ending.t += dt / this.game.params.speed;
    const at = (id: string, time: number, run: () => void) => {
      if (ending.t >= time && !ending.fired.has(id)) {
        ending.fired.add(id);
        run();
      }
    };
    if (ending.kind === "breach") {
      at("scare", 1.6, () => {
        this.jumpscare.classList.add("show");
        this.game.audio.screech();
      });
      at("out", 3.7, () => this.game.goGameOver(this.outcome("breach")));
    } else {
      at("out", 10, () => this.game.goShiftComplete(this.outcome("dawn")));
    }
  }

  private outcome(result: "dawn" | "breach"): NightOutcome {
    const s = this.sim.state;
    return {
      result,
      clock: this.sim.clock,
      agent: s.breachedBy,
      linksCompleted: s.gpt.linksCompleted,
      contactsMissed: s.gpt.contactsMissed,
      sealShuts: this.stats.sealShuts,
      peakHeat: Math.round(this.stats.peakHeat),
    };
  }
}

export function agentName(agent: AgentId | null): string {
  return agent ? AGENT_NAMES[agent] : "Something";
}
