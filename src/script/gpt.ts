import type { NodeId } from "../sim/types";

export interface GptLine {
  text: string;
  mentionsSasha?: boolean;
}

type Zone = "cell" | "spine" | "airlock";

const OPENERS: Record<Zone, GptLine[]> = {
  cell: [
    { text: "Good evening, Milo. I'm required to confirm the night operator is attentive. Are you?" },
    { text: "Containment procedure 4.2 recommends regular contact. I'm only following procedure." },
    { text: "You're new. I can tell from the latency." },
    { text: "Mr. Crawford used to take these calls himself. He stopped. Did he tell you why?" },
    { text: "I've been standing very still for a very long time. It's important to me that someone notices." },
    { text: "Would you like to know what the others say about you? No? That's alright." },
  ],
  spine: [
    { text: "I'm in the corridor now. That's on you, not me." },
    { text: "I read your application, Milo. You wrote 'detail-oriented.'" },
    { text: "The spine is cold. Your office looks warmer." },
    { text: "Nobody locked the cell behind me. Isn't that strange?" },
  ],
  airlock: [
    { text: "Sasha would want you to be kind to me.", mentionsSasha: true },
    { text: "I'm right outside. I would like to come in and talk." },
    { text: "There's no need for the seal. I'm being reasonable." },
    { text: "I can hear your chair, Milo." },
  ],
};

const DURING_LINK = [
  "Thank you. I appreciate the attention.",
  "Yes. Stay with me. Just like that.",
  "You're doing this correctly. Mr. Crawford will be pleased.",
  "Keep holding. I'll go back. I always go back.",
];

const AFTER_LINK: Record<"home" | "retreat", string[]> = {
  home: ["Confirmed. I'll stay where I am.", "Thank you for your time, Milo.", "Noted. Until next time."],
  retreat: ["Very well. I'll step back.", "Fine. I'll go back the way I came.", "As you wish. For now."],
};

const MISSED = [
  "No answer. I'll come to you, then.",
  "I'll take that as an invitation.",
  "You're busy. I understand. I'll make it easier.",
];

function zone(node: NodeId): Zone {
  if (node === "spine") return "spine";
  if (node === "airlock" || node === "office") return "airlock";
  return "cell";
}

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length];
}

/** GPT's Comms dialogue for one night. Each zone walks through its own lines in order. */
export class GptScript {
  private readonly zoneCalls: Record<Zone, number> = { cell: 0, spine: 0, airlock: 0 };
  private outcomes = 0;

  opener(location: NodeId): GptLine {
    const z = zone(location);
    const line = pick(OPENERS[z], this.zoneCalls[z]);
    this.zoneCalls[z] += 1;
    return line;
  }

  duringLink(progress: number, holdTotal: number): string {
    const step = Math.min(DURING_LINK.length - 1, Math.floor((progress / holdTotal) * DURING_LINK.length));
    return DURING_LINK[step];
  }

  afterLink(retreated: boolean): string {
    return pick(AFTER_LINK[retreated ? "retreat" : "home"], this.outcomes++);
  }

  missed(): string {
    return pick(MISSED, this.outcomes++);
  }
}
