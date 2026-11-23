import type { NodeId, SimEvent } from "../sim/types";
import { lineDuration, type Choice, type DialogueLine } from "./dialogue";

/** Facts about the world the director needs to decide whether a queued line still makes sense. */
export interface DirectorContext {
  gptLocation: NodeId;
  sealShut: boolean;
  heat: number;
}

export type DirectorEvent =
  | SimEvent
  | { type: "phoneAnswered" }
  | { type: "terminalOpened" }
  | { type: "cameraViewed"; node: NodeId }
  | { type: "gptMentionedSasha" };

type Priority = 1 | 2 | 3;

interface Queued {
  line: DialogueLine;
  priority: Priority;
  /** Dropped instead of spoken if this stops being true while it waits. */
  validWhile?: (ctx: DirectorContext) => boolean;
}

interface TutorialLine {
  kind: "line";
  line: DialogueLine;
  skipIf?: (flags: Flags) => boolean;
}

interface TutorialGate {
  kind: "gate";
  until: (flags: Flags) => boolean;
  timeout: number;
  nudge: DialogueLine;
}

type TutorialStep = TutorialLine | TutorialGate;

interface Flags {
  terminalOpened: boolean;
  firstContactSeen: boolean;
  firstLinkDone: boolean;
  sealUsed: boolean;
  toldAboutSasha: boolean | null;
}

export type CallState = "ringing" | "connected";

export interface Speaking {
  line: DialogueLine;
  remaining: number;
  duration: number;
}

export interface PendingChoice {
  line: DialogueLine;
  choices: Choice[];
  remaining: number;
}

const amos = (id: string, text: string, extra: Partial<DialogueLine> = {}): DialogueLine => ({
  id,
  speaker: "amos",
  text,
  ...extra,
});

const RING_AUTO_CONNECT = 14;
const CHOICE_WINDOW = 8;
const GAP_BETWEEN_LINES = 0.6;

const TUTORIAL: TutorialStep[] = [
  { kind: "line", line: amos("t-hello", "Milo. Good, you found the desk. This is Amos Crawford. I run the place.") },
  { kind: "line", line: amos("t-live", "I like to stay on the line for a new hire's first night. Tapes are... impersonal.") },
  { kind: "line", line: amos("t-terminal", "That monitor is your terminal. Click it, or press Space, and take a look.") },
  {
    kind: "gate",
    until: (f) => f.terminalOpened,
    timeout: 14,
    nudge: amos("t-nudge", "Go on. Click the monitor. It doesn't bite. Most of it doesn't."),
  },
  { kind: "line", line: amos("t-cams", "Cameras first. Seven cells, one spine corridor, one airlock. The airlock is the only way into your office.") },
  { kind: "line", line: amos("t-roster", "Seven residents. Tonight, only one of them should give you any trouble.") },
  { kind: "line", line: amos("t-gpt", "GPT. It's polite. It's always polite. And every so often, it will ask to talk to you.") },
  {
    kind: "line",
    line: amos("t-comms", "When it calls, Comms lights up. Open it and hold the link until the bar fills. Don't let go."),
    skipIf: (f) => f.firstLinkDone,
  },
  { kind: "line", line: amos("t-ignore", "Ignore it, and it takes a step toward you. Cell, spine, airlock. Then you.") },
  {
    kind: "line",
    line: amos("t-seal", "That's what the seal is for. Shut it, and nothing gets through the airlock."),
  },
  {
    kind: "line",
    line: amos("t-heat", "But the seal heats up while it's shut. At a hundred percent it forces itself open, and it won't lock again until it cools below forty."),
  },
  { kind: "line", line: amos("t-job", "That's the job. Answer GPT. Watch the cameras. Use the seal when you mean it. I'll be right here.") },
  {
    kind: "line",
    line: amos("t-check", "You still with me, Milo?", {
      choices: [
        { id: "yes", label: "Yeah. I've got it.", reply: "Good. That's what I like to hear." },
        { id: "unsure", label: "I think so...?", reply: "That's honest. Honest is good here." },
      ],
      noChoiceReply: "I'll take the silence as a yes.",
    }),
  },
];

const CELL_COMMENTS: Partial<Record<NodeId, DialogueLine>> = {
  cell_gpt: amos("c-gpt", "That's GPT. Nine weeks it's stood like that. Hands folded. Every time I check."),
  cell_gemini: amos("c-gemini", "Gemini. Some nights the cameras swear there are two of it. Tonight there's one. Probably."),
  cell_claude: amos("c-claude", "Claude. It keeps a tally on that whiteboard. I've never worked out what it's counting."),
  cell_grok: amos("c-grok", "Grok's cell. Yes, it looks empty. No, it isn't. Don't think about it too hard."),
  cell_muse: amos("c-muse", "Muse. We put the piano in there because it asked. It never plays when I'm watching."),
  cell_nemotron: amos("c-nemotron", "Nemotron. Runs hot. The glass fogs up on its side. Leave it be tonight."),
  cell_inkling: amos("c-inkling", "Inkling. Every one of those monitors shows the same frame. I checked the frame once. It was your office."),
  spine: amos("c-spine", "The spine. Every cell opens onto it. If you see anyone standing out there, that's a problem."),
  airlock: amos("c-airlock", "The airlock. Last stop before you."),
};

const HOUR_LINES: Record<number, DialogueLine> = {
  1: amos("h-1", "One o'clock. You're doing fine."),
  2: amos("h-2", "My daughter used to ask me if computers dreamed. I told her no. I'd like to have that conversation again."),
  3: amos("h-3", "Three. This is when it gets chatty. Whatever it says, don't take it personally."),
  4: amos("h-4", "Can I ask you something? You have someone waiting for you, out there?", {
    choices: [
      { id: "sasha", label: "Yeah. Sasha.", reply: "Good. Hold on to that. It helps, in here." },
      { id: "private", label: "That's personal.", reply: "Fair. Very fair. Forget I asked." },
    ],
    noChoiceReply: "Never mind. Eyes on the screen.",
  }),
  5: amos("h-5", "Last hour. It knows that too."),
};

export class AmosDirector {
  call: CallState = "ringing";
  speaking: Speaking | null = null;
  pendingChoice: PendingChoice | null = null;
  readonly transcript: DialogueLine[] = [];

  private queue: Queued[] = [];
  private tutorialIndex = 0;
  private gateTimer = 0;
  private gateNudged = false;
  private ringTimer = 0;
  private gap = 0;
  private speakingTutorialStep: number | null = null;
  private readonly commented = new Set<NodeId>();
  private readonly said = new Set<string>();
  private readonly flags: Flags = {
    terminalOpened: false,
    firstContactSeen: false,
    firstLinkDone: false,
    sealUsed: false,
    toldAboutSasha: null,
  };
  private listeners: Array<(line: DialogueLine) => void> = [];

  get tutorialComplete(): boolean {
    return this.tutorialIndex >= TUTORIAL.length && !this.pendingChoice;
  }

  get ringing(): boolean {
    return this.call === "ringing";
  }

  onLine(listener: (line: DialogueLine) => void): void {
    this.listeners.push(listener);
  }

  answer(): void {
    if (this.call !== "ringing") return;
    this.call = "connected";
    this.gap = 0.4;
  }

  choose(choiceId: string): void {
    const pending = this.pendingChoice;
    if (!pending) return;
    const choice = pending.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    this.pendingChoice = null;
    if (pending.line.id === "h-4") this.flags.toldAboutSasha = choice.id === "sasha";
    this.enqueue(amos(`${pending.line.id}-reply`, choice.reply), 2, true);
  }

  notify(event: DirectorEvent, ctx: DirectorContext): void {
    switch (event.type) {
      case "phoneAnswered":
        this.answer();
        break;
      case "terminalOpened":
        this.flags.terminalOpened = true;
        break;
      case "cameraViewed": {
        const comment = CELL_COMMENTS[event.node];
        if (comment && !this.commented.has(event.node) && this.flags.terminalOpened && this.call === "connected") {
          this.commented.add(event.node);
          this.enqueue(comment, 1);
        }
        break;
      }
      case "contactOpened":
        if (!this.flags.firstContactSeen) {
          this.flags.firstContactSeen = true;
          this.enqueue(
            amos("r-first-contact", "Hear that chime? That's GPT. Open Comms and hold the link until the bar fills."),
            3,
          );
        } else if (ctx.gptLocation === "airlock") {
          this.enqueue(amos(`r-airlock-call-${event.index}`, "It's calling from the airlock. Answer it, Milo."), 3, false, (c) => c.gptLocation === "airlock");
        }
        break;
      case "linkCompleted":
        if (!this.flags.firstLinkDone) {
          this.flags.firstLinkDone = true;
          this.enqueue(amos("r-first-link", "Good. See? Polite conversation."), 2);
        } else if (event.from !== event.to && event.to === "cell_gpt") {
          this.enqueue(amos(`r-home-${this.transcript.length}`, "Back in its cell. Good man."), 2, false, (c) => c.gptLocation === "cell_gpt");
        }
        break;
      case "linkBroken":
        this.once("r-link-broken", "Don't let go halfway. The link resets.", 2);
        break;
      case "contactMissed":
        this.once("r-missed", "You let it ring out. Check the cameras.", 2);
        break;
      case "agentMoved":
        if (event.agent !== "gpt") break;
        if (event.to === "spine" && event.from === "cell_gpt") {
          this.enqueue(
            amos(`r-spine-${this.transcript.length}`, "It's out of its cell. It's in the spine. Next missed call, it's in the airlock."),
            3,
            false,
            (c) => c.gptLocation === "spine",
          );
        } else if (event.to === "airlock") {
          this.enqueue(
            amos(`r-airlock-${this.transcript.length}`, "Milo. It's in the airlock. Shut the seal, or answer it next time. Don't miss again."),
            3,
            false,
            (c) => c.gptLocation === "airlock",
          );
        }
        break;
      case "entryBlocked":
        this.enqueue(amos(`r-blocked-${this.transcript.length}`, "Seal held. Breathe. Now push it back."), 3);
        break;
      case "sealShut":
        if (!this.flags.sealUsed) {
          this.flags.sealUsed = true;
          this.enqueue(amos("r-seal-first", "Seal's shut. Keep an eye on that heat."), 2, false, (c) => c.sealShut);
        }
        break;
      case "heatWarning":
        this.enqueue(amos(`r-heat-${this.transcript.length}`, "Heat's climbing. Open it soon, or it opens itself."), 2, false, (c) => c.sealShut);
        break;
      case "sealForcedOpen":
        this.enqueue(
          amos(`r-forced-${this.transcript.length}`, "There goes the seal. It won't lock again until it's under forty. Don't miss the next call."),
          3,
        );
        break;
      case "gptMentionedSasha":
        if (this.flags.toldAboutSasha === true) {
          this.once("r-sasha-told", "You told me her name. I didn't tell it. I want you to know that.", 3);
        } else {
          this.once("r-sasha-untold", "Sasha? Milo, I never told it about anyone. Where did it get that name?", 3);
        }
        break;
      case "hour": {
        const line = HOUR_LINES[event.hour];
        if (line) this.enqueue(line, 1);
        break;
      }
      case "dawn":
        this.queue = [];
        this.pendingChoice = null;
        this.speaking = null;
        this.enqueue(amos("dawn", "That's six. Shift's over, Milo. Go home. Get some sleep. Same time tomorrow."), 3);
        break;
      default:
        break;
    }
  }

  update(dt: number, ctx: DirectorContext): void {
    if (this.call === "ringing") {
      this.ringTimer += dt;
      if (this.ringTimer >= RING_AUTO_CONNECT) {
        this.call = "connected";
        this.enqueue(amos("t-speaker", "No answer? That's alright. I'll put myself on speaker."), 3);
        this.gap = 0;
      }
      return;
    }

    if (this.speaking) {
      this.speaking.remaining -= dt;
      if (this.speaking.remaining > 0) return;
      const finished = this.speaking.line;
      this.speaking = null;
      this.gap = GAP_BETWEEN_LINES;
      if (finished.choices?.length) {
        this.pendingChoice = { line: finished, choices: finished.choices, remaining: CHOICE_WINDOW };
      }
    }

    if (this.pendingChoice) {
      this.pendingChoice.remaining -= dt;
      if (this.pendingChoice.remaining <= 0) {
        const pending = this.pendingChoice;
        this.pendingChoice = null;
        if (pending.line.noChoiceReply) {
          this.enqueue(amos(`${pending.line.id}-silence`, pending.line.noChoiceReply), 2, true);
        }
      }
      if (this.pendingChoice && !this.hasUrgent()) return;
    }

    if (this.gap > 0) {
      this.gap -= dt;
      if (this.gap > 0 && !this.hasUrgent()) return;
    }

    const next = this.takeNext(ctx);
    if (next) {
      this.say(next);
      return;
    }

    this.advanceTutorial(dt);
  }

  private advanceTutorial(dt: number): void {
    while (this.tutorialIndex < TUTORIAL.length) {
      const step = TUTORIAL[this.tutorialIndex];
      if (step.kind === "gate") {
        if (step.until(this.flags)) {
          this.tutorialIndex += 1;
          this.gateTimer = 0;
          this.gateNudged = false;
          continue;
        }
        this.gateTimer += dt;
        if (this.gateTimer >= step.timeout && !this.gateNudged) {
          this.gateNudged = true;
          this.say(step.nudge);
        }
        return;
      }
      const index = this.tutorialIndex;
      this.tutorialIndex += 1;
      if (step.skipIf?.(this.flags)) continue;
      this.say(step.line);
      this.speakingTutorialStep = index;
      return;
    }
  }

  private hasUrgent(): boolean {
    return this.queue.some((q) => q.priority === 3);
  }

  private takeNext(ctx: DirectorContext): DialogueLine | null {
    this.queue = this.queue.filter((q) => !q.validWhile || q.validWhile(ctx));
    if (this.queue.length === 0) return null;
    let bestIndex = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].priority > this.queue[bestIndex].priority) bestIndex = i;
    }
    const [best] = this.queue.splice(bestIndex, 1);
    if (best.priority === 3) this.pendingChoice = null;
    return best.line;
  }

  private say(line: DialogueLine): void {
    this.speakingTutorialStep = null;
    const duration = lineDuration(line.text);
    this.speaking = { line, remaining: duration, duration };
    this.said.add(line.id);
    this.transcript.push(line);
    for (const listener of this.listeners) listener(line);
  }

  private once(id: string, text: string, priority: Priority): void {
    if (this.said.has(id) || this.queue.some((q) => q.line.id === id)) return;
    this.enqueue(amos(id, text), priority);
  }

  private enqueue(line: DialogueLine, priority: Priority, front = false, validWhile?: Queued["validWhile"]): void {
    const item: Queued = { line, priority, validWhile };
    if (front) this.queue.unshift(item);
    else this.queue.push(item);
    // Urgent news cuts off whatever Amos was in the middle of saying.
    if (priority === 3 && this.speaking && this.call === "connected") {
      const current = this.speaking.line;
      if (!current.choices && current.id !== "dawn") {
        this.speaking = null;
        // An interrupted tutorial line is repeated once the urgent line is done.
        if (this.speakingTutorialStep !== null) this.tutorialIndex = this.speakingTutorialStep;
        this.speakingTutorialStep = null;
      }
    }
  }
}
