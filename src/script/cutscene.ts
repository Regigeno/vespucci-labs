import type { Speaker } from "./dialogue";

export interface TimedLine {
  at: number;
  speaker: Speaker;
  text: string;
}

/** Milo's phone call with Sasha while he crosses the lot to the side entrance. */
export const SASHA_CALL: TimedLine[] = [
  { at: 1.8, speaker: "sasha", text: "So you're actually there? On Street View it looks like a prison." },
  { at: 6.2, speaker: "milo", text: "It's a data center. Prisons have windows." },
  { at: 9.6, speaker: "sasha", text: "That is not the comforting point you think it is." },
  { at: 13.4, speaker: "milo", text: "One week, Sash. Seven nights. Then I can actually afford a place near campus." },
  { at: 18.6, speaker: "sasha", text: "And they're paying you all that to do... what, exactly?" },
  { at: 22.4, speaker: "milo", text: "Watch some screens. Make sure nothing gets out." },
  { at: 26.0, speaker: "sasha", text: "Gets out. Of a computer." },
  { at: 28.8, speaker: "milo", text: "I signed a thing. I'm not supposed to talk about it." },
  { at: 32.2, speaker: "sasha", text: "Milo." },
  { at: 33.6, speaker: "milo", text: "It's software. Worst case, I fall asleep at the desk." },
  { at: 37.4, speaker: "sasha", text: "Text me on your break. Promise?" },
  { at: 40.4, speaker: "milo", text: "Promise. I'm at the door. 'Employees only.'" },
  { at: 43.8, speaker: "sasha", text: "Then you'd better be an employee. Love you. Be careful." },
  { at: 47.6, speaker: "milo", text: "Love you too." },
];

export const CUTSCENE_TIMING = {
  shotSwapStart: 33,
  shotSwapEnd: 36,
  stopWalking: 47,
  hangUp: 49.6,
  keycard: 51,
  doorOpen: 52.4,
  fadeOut: 53.2,
  titleCard: 54.6,
  end: 59,
};
