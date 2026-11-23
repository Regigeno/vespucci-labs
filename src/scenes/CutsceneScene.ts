import { STAGE_H, STAGE_W } from "../constants";
import type { Game, Scene } from "../game";
import { RainLayer } from "../fx/Rain";
import type { VoiceHandle } from "../audio/AudioEngine";
import { CUTSCENE_TIMING as T, SASHA_CALL } from "../script/cutscene";
import { SPEAKER_NAMES, lineDuration } from "../script/dialogue";
import { asset, el, img } from "../ui/dom";

const smooth = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export class CutsceneScene implements Scene {
  readonly root: HTMLElement;
  private readonly camera: HTMLElement;
  private readonly shotA: HTMLElement;
  private readonly shotB: HTMLElement;
  private readonly reader: HTMLElement;
  private readonly rain: RainLayer;
  private readonly subtitle: HTMLElement;
  private readonly subtitleName: HTMLElement;
  private readonly subtitleText: HTMLElement;
  private readonly callTimer: HTMLElement;
  private readonly callPanel: HTMLElement;
  private readonly card: HTMLElement;
  private readonly blackout: HTMLElement;
  private readonly skipRing: HTMLElement;

  private t = 0;
  private phase = 0;
  private nextLine = 0;
  private lineEndsAt = 0;
  private voice: VoiceHandle | null = null;
  private fired = new Set<string>();
  private skipHeld = 0;
  private skipping = false;
  private finished = false;

  constructor(private readonly game: Game) {
    this.shotA = el("div", "cs-shot", [img(asset("cutscene_approach.jpg"))]);
    this.shotB = el("div", "cs-shot", [img(asset("cutscene_door.jpg"))]);
    this.reader = el("div", "cs-reader");
    this.shotB.append(this.reader);
    this.shotB.style.opacity = "0";
    this.camera = el("div", "cs-camera", [this.shotA, this.shotB]);
    this.rain = new RainLayer({ width: STAGE_W, height: STAGE_H, density: 700, wind: 0.08, lens: true, horizon: 0.6 });

    this.subtitleName = el("span", "sub-name");
    this.subtitleText = el("span", "sub-text");
    this.subtitle = el("div", "subtitle cs-subtitle", [this.subtitleName, this.subtitleText]);

    this.callTimer = el("span", "call-time", ["0:00"]);
    this.callPanel = el("div", "call-panel", [
      el("div", "call-avatar", ["S"]),
      el("div", "call-meta", [el("span", "call-name", ["Sasha"]), this.callTimer]),
      el("div", "call-wave", [el("i"), el("i"), el("i"), el("i"), el("i")]),
    ]);

    this.card = el("div", "cs-card", [
      el("div", "cs-card-time", ["12:00 AM"]),
      el("div", "cs-card-night", ["Night 1"]),
      el("div", "cs-card-place", ["Vespucci Labs · Monitoring Station 4"]),
    ]);
    this.blackout = el("div", "cs-blackout");
    this.skipRing = el("div", "skip-hint", [el("span", "skip-fill"), "Hold Space to skip"]);

    this.root = el("div", "scene cutscene", [
      this.camera,
      this.rain.canvas,
      el("div", "cs-grade"),
      el("div", "letterbox top"),
      el("div", "letterbox bottom"),
      this.callPanel,
      this.subtitle,
      this.skipRing,
      this.blackout,
      this.card,
    ]);

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  private skipKey = false;

  enter(): void {
    this.game.audio.setRain(1, false, 3);
    this.game.audio.setHum(0);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  exit(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.voice?.stop();
  }

  update(dt: number): void {
    if (this.finished) return;
    this.t += dt;
    const t = this.t;

    this.updateSkip(dt);
    this.updateCamera(dt, t);
    this.updateDialogue(t);
    this.updateEvents(t);

    this.rain.intensity = 1 - smooth(T.fadeOut, T.titleCard, t) * 0.6;
    this.rain.update(dt);
    this.rain.draw();

    const seconds = Math.max(0, Math.floor(t + 214));
    this.callTimer.textContent = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
  }

  private updateCamera(dt: number, t: number): void {
    const walking = 1 - smooth(T.stopWalking - 2.5, T.stopWalking, t);
    const prevPhase = this.phase;
    this.phase += dt * Math.PI * 2 * 0.9 * walking;
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI)) this.game.audio.footstep();

    const bobY = Math.sin(this.phase * 2) * 7 * walking;
    const bobX = Math.sin(this.phase) * 6 * walking;
    const roll = Math.sin(this.phase) * 0.45 * walking;
    const push = smooth(T.doorOpen, T.fadeOut + 0.6, t) * 0.12;
    this.camera.style.transform = `translate(${bobX}px, ${bobY}px) rotate(${roll}deg) scale(${1.06 + push})`;

    const a = smooth(0, T.shotSwapEnd, t);
    this.shotA.style.transformOrigin = "76.6% 59%";
    this.shotA.style.transform = `scale(${1 + a * 1.25})`;
    const swap = smooth(T.shotSwapStart, T.shotSwapEnd, t);
    this.shotA.style.opacity = String(1 - swap);
    this.shotB.style.opacity = String(swap);
    this.shotA.style.filter = `blur(${swap * 4}px)`;
    const b = smooth(T.shotSwapStart, T.stopWalking, t);
    this.shotB.style.transformOrigin = "60% 50%";
    this.shotB.style.transform = `scale(${1.02 + b * 0.42})`;
  }

  private updateDialogue(t: number): void {
    const line = SASHA_CALL[this.nextLine];
    if (line && t >= line.at) {
      this.nextLine += 1;
      const following = SASHA_CALL[this.nextLine];
      const duration = following ? Math.min(lineDuration(line.text), following.at - line.at - 0.15) : lineDuration(line.text);
      this.lineEndsAt = t + duration;
      this.subtitleName.textContent = line.speaker === "milo" ? "" : SPEAKER_NAMES[line.speaker];
      this.subtitleText.textContent = line.text;
      this.subtitle.dataset.speaker = line.speaker;
      this.subtitle.classList.add("show");
      this.callPanel.classList.toggle("talking", line.speaker === "sasha");
      this.voice?.stop();
      this.voice = this.game.audio.speak(line.speaker, duration);
    }
    if (t >= this.lineEndsAt && this.subtitle.classList.contains("show")) {
      this.subtitle.classList.remove("show");
      this.callPanel.classList.remove("talking");
    }
  }

  private updateEvents(t: number): void {
    this.once("thunder", t >= 9, () => {
      this.rain.lightning();
      this.root.classList.add("flash");
      window.setTimeout(() => this.root.classList.remove("flash"), 140);
      window.setTimeout(() => this.game.audio.thunder(), 900);
    });
    this.once("thunder2", t >= 38.5, () => {
      this.rain.lightning();
      window.setTimeout(() => this.game.audio.thunder(), 1400);
    });
    this.once("hangup", t >= T.hangUp, () => {
      this.game.audio.phoneHangup();
      this.callPanel.classList.add("ended");
    });
    this.once("keycard", t >= T.keycard, () => {
      this.game.audio.keycard(true);
      this.reader.classList.add("ok");
    });
    this.once("door", t >= T.doorOpen, () => this.game.audio.doorOpen());
    this.once("fade", t >= T.fadeOut, () => {
      this.blackout.classList.add("on");
      this.game.audio.setRain(0.6, true, 2.5);
    });
    this.once("card", t >= T.titleCard, () => this.card.classList.add("show"));
    this.once("end", t >= T.end, () => this.finish());
  }

  private updateSkip(dt: number): void {
    if (this.skipKey && !this.skipping) {
      this.skipHeld += dt / this.game.params.speed;
      if (this.skipHeld >= 0.9) {
        this.skipping = true;
        this.finish();
      }
    } else if (!this.skipKey) {
      this.skipHeld = Math.max(0, this.skipHeld - dt * 2);
    }
    this.skipRing.style.setProperty("--fill", String(Math.min(1, this.skipHeld / 0.9)));
    this.skipRing.classList.toggle("active", this.skipHeld > 0);
  }

  private once(id: string, condition: boolean, run: () => void): void {
    if (condition && !this.fired.has(id)) {
      this.fired.add(id);
      run();
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.voice?.stop();
    this.game.goNight(false);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === " " || e.key === "Escape") {
      e.preventDefault();
      this.skipKey = true;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === " " || e.key === "Escape") this.skipKey = false;
  }
}
