import type { NightConfig } from "./config";
import { createRng, rangeFrom } from "./rng";
import {
  AGENT_NAMES,
  ROSTER,
  homeCell,
  type AgentId,
  type NightInput,
  type NightState,
  type NodeId,
  type SimEvent,
} from "./types";

const STEP = 0.05;
const EPS = 1e-6;

const NODE_LABELS: Record<NodeId, string> = {
  office: "Office",
  airlock: "Airlock",
  spine: "Spine",
  cell_gpt: "Cell GPT",
  cell_gemini: "Cell Gemini",
  cell_claude: "Cell Claude",
  cell_grok: "Cell Grok",
  cell_muse: "Cell Muse",
  cell_nemotron: "Cell Nemotron",
  cell_inkling: "Cell Inkling",
};

export function nodeLabel(node: NodeId): string {
  return NODE_LABELS[node];
}

/** "12:00 AM" … "6:00 AM", from elapsed seconds. */
export function clockLabel(elapsed: number, secondsPerHour: number): string {
  const totalMinutes = Math.floor((elapsed / secondsPerHour) * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const displayHour = hour === 0 ? 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, "0")} AM`;
}

export function towardOffice(node: NodeId, agent: AgentId): NodeId {
  if (node === homeCell(agent)) return "spine";
  if (node === "spine") return "airlock";
  if (node === "airlock") return "office";
  return node;
}

export function awayFromOffice(node: NodeId, agent: AgentId): NodeId {
  if (node === "airlock") return "spine";
  if (node === "spine") return homeCell(agent);
  return node;
}

export class NightSim {
  readonly config: NightConfig;
  readonly state: NightState;
  private readonly rng: () => number;
  private heatWarned = false;
  private linkWasHeld = false;

  constructor(config: NightConfig) {
    this.config = config;
    this.rng = createRng(config.seed);
    const locations = Object.fromEntries(
      ROSTER.map((agent) => [agent, homeCell(agent)]),
    ) as Record<AgentId, NodeId>;
    this.state = {
      phase: "active",
      elapsed: 0,
      hour: 0,
      seal: { shut: false, heat: 0, forcedOpen: false },
      locations,
      gpt: {
        nextContactAt: config.gpt.firstContactAt,
        contact: null,
        linkProgress: 0,
        contactsOpened: 0,
        linksCompleted: 0,
        contactsMissed: 0,
      },
      breachedBy: null,
      log: [{ at: 0, text: "Night 1 begins. All seven agents contained." }],
    };
  }

  get nightLength(): number {
    return this.config.secondsPerHour * this.config.hours;
  }

  get clock(): string {
    return clockLabel(this.state.elapsed, this.config.secondsPerHour);
  }

  get linkActive(): boolean {
    return this.state.gpt.linkProgress > 0;
  }

  /** Push the next GPT contact back, e.g. so Amos can finish the walkthrough before the first call. */
  deferNextContact(seconds: number): void {
    if (!this.state.gpt.contact) this.state.gpt.nextContactAt += seconds;
  }

  /** Advance the night. Large deltas are split into fixed steps so a fast-forward never skips a rule. */
  tick(dt: number, input: NightInput): SimEvent[] {
    const events: SimEvent[] = [];
    let remaining = Math.max(0, dt);
    let sealCommand = input.sealCommand;
    while (remaining > 1e-9 && this.state.phase === "active") {
      const step = Math.min(STEP, remaining);
      remaining -= step;
      this.step(step, { holdLink: input.holdLink, sealCommand }, events);
      sealCommand = null;
    }
    if (dt === 0 && sealCommand && this.state.phase === "active") {
      this.applySealCommand(sealCommand, events);
    }
    return events;
  }

  private step(dt: number, input: NightInput, events: SimEvent[]): void {
    const s = this.state;

    // 1. Input
    if (input.sealCommand) this.applySealCommand(input.sealCommand, events);

    // 2. Night cycle
    s.elapsed += dt;
    const hour = Math.min(this.config.hours, Math.floor((s.elapsed + EPS) / this.config.secondsPerHour));
    if (hour !== s.hour) {
      s.hour = hour;
      if (hour < this.config.hours) {
        events.push({ type: "hour", hour });
        this.log(`${clockLabel(s.elapsed, this.config.secondsPerHour)}.`);
      }
    }
    if (s.elapsed >= this.nightLength - EPS) {
      s.phase = "dawn";
      s.gpt.contact = null;
      s.gpt.linkProgress = 0;
      this.log("6:00 AM. Shift complete.");
      events.push({ type: "dawn" });
      return;
    }

    // 3. Office: seal heat
    this.stepSeal(dt, events);

    // 4. Agents: only GPT acts in the Night 1 demo
    this.stepGpt(dt, input.holdLink, events);

    // 5. Breach
    for (const agent of ROSTER) {
      if (s.locations[agent] === "office") {
        s.phase = "breached";
        s.breachedBy = agent;
        s.gpt.contact = null;
        s.gpt.linkProgress = 0;
        this.log(`BREACH. ${AGENT_NAMES[agent]} entered the office.`);
        events.push({ type: "breach", agent });
        return;
      }
    }
  }

  private applySealCommand(command: "shut" | "open", events: SimEvent[]): void {
    const seal = this.state.seal;
    if (this.linkActive) {
      events.push({ type: "sealRejected", reason: "linkActive" });
      return;
    }
    if (command === "shut") {
      if (seal.shut) return;
      if (seal.forcedOpen) {
        events.push({ type: "sealRejected", reason: "forcedOpen" });
        return;
      }
      seal.shut = true;
      this.log("Seal shut.");
      events.push({ type: "sealShut" });
    } else {
      if (!seal.shut) return;
      seal.shut = false;
      this.log("Seal open.");
      events.push({ type: "sealOpened" });
    }
  }

  private stepSeal(dt: number, events: SimEvent[]): void {
    const seal = this.state.seal;
    const cfg = this.config.seal;
    if (seal.shut) {
      seal.heat = Math.min(cfg.forceOpenAt, seal.heat + cfg.heatGainShut * dt);
      if (!this.heatWarned && seal.heat >= cfg.warnAt) {
        this.heatWarned = true;
        events.push({ type: "heatWarning" });
      }
      if (seal.heat >= cfg.forceOpenAt) {
        seal.shut = false;
        seal.forcedOpen = true;
        this.log("Seal forced open: thermal limit.");
        events.push({ type: "sealForcedOpen" });
      }
    } else {
      seal.heat = Math.max(0, seal.heat - cfg.coolOpen * dt);
      if (seal.heat < cfg.warnAt - 10) this.heatWarned = false;
      if (seal.forcedOpen && seal.heat < cfg.relockBelow) {
        seal.forcedOpen = false;
        this.log("Seal cooled. Lock available.");
        events.push({ type: "sealRelockable" });
      }
    }
  }

  private stepGpt(dt: number, holdLink: boolean, events: SimEvent[]): void {
    const s = this.state;
    const gpt = s.gpt;
    const cfg = this.config.gpt;

    if (!gpt.contact) {
      gpt.linkProgress = 0;
      this.linkWasHeld = false;
      if (s.elapsed >= gpt.nextContactAt - EPS) {
        const window = cfg.windowByHour[Math.min(s.hour, cfg.windowByHour.length - 1)];
        gpt.contact = {
          openedAt: s.elapsed,
          deadline: s.elapsed + window,
          index: gpt.contactsOpened,
        };
        gpt.contactsOpened += 1;
        this.log("GPT contact opened.");
        events.push({ type: "contactOpened", index: gpt.contact.index, deadline: gpt.contact.deadline });
      }
      return;
    }

    // A completed hold resolves before the deadline on the same tick.
    if (holdLink) {
      if (!this.linkWasHeld) events.push({ type: "linkStarted" });
      this.linkWasHeld = true;
      gpt.linkProgress += dt;
      if (gpt.linkProgress >= cfg.linkHold - EPS) {
        const from = s.locations.gpt;
        const to = awayFromOffice(from, "gpt");
        s.locations.gpt = to;
        gpt.linksCompleted += 1;
        gpt.contact = null;
        gpt.linkProgress = 0;
        this.linkWasHeld = false;
        this.log(from === to ? "Link maintained. GPT remained in its cell." : `Link maintained. GPT moved: ${nodeLabel(from)} → ${nodeLabel(to)}.`);
        events.push({ type: "linkCompleted", from, to });
        if (from !== to) events.push({ type: "agentMoved", agent: "gpt", from, to });
        this.scheduleNextContact();
        return;
      }
    } else if (this.linkWasHeld) {
      this.linkWasHeld = false;
      gpt.linkProgress = 0;
      events.push({ type: "linkBroken" });
    }

    if (s.elapsed >= gpt.contact.deadline - EPS) {
      const from = s.locations.gpt;
      gpt.contact = null;
      gpt.linkProgress = 0;
      this.linkWasHeld = false;
      gpt.contactsMissed += 1;
      this.log("GPT contact missed.");
      events.push({ type: "contactMissed", from });
      const to = towardOffice(from, "gpt");
      if (to === "office" && s.seal.shut) {
        this.log("Airlock seal blocked GPT.");
        events.push({ type: "entryBlocked", agent: "gpt" });
      } else if (to !== from) {
        s.locations.gpt = to;
        if (to !== "office") this.log(`GPT moved: ${nodeLabel(from)} → ${nodeLabel(to)}.`);
        events.push({ type: "agentMoved", agent: "gpt", from, to });
      }
      this.scheduleNextContact();
    }
  }

  private scheduleNextContact(): void {
    const s = this.state;
    const gaps = this.config.gpt.gapByHour;
    const [min, max] = gaps[Math.min(s.hour, gaps.length - 1)];
    s.gpt.nextContactAt = s.elapsed + rangeFrom(this.rng, min, max);
  }

  private log(text: string): void {
    this.state.log.push({ at: this.state.elapsed, text });
  }
}
