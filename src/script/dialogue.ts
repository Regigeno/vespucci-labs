export type Speaker = "amos" | "sasha" | "milo" | "gpt";

export const SPEAKER_NAMES: Record<Speaker, string> = {
  amos: "AMOS",
  sasha: "SASHA",
  milo: "MILO",
  gpt: "GPT",
};

export interface Choice {
  id: string;
  label: string;
  /** What Amos says back. */
  reply: string;
}

export interface DialogueLine {
  id: string;
  speaker: Speaker;
  text: string;
  choices?: Choice[];
  /** Spoken if no choice is made before the choice timer runs out. */
  noChoiceReply?: string;
}

/** Reading-speed based duration so subtitles stay up long enough to read. */
export function lineDuration(text: string): number {
  return Math.min(8, Math.max(2.2, 1.4 + text.length * 0.05));
}
