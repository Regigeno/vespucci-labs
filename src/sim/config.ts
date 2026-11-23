export interface NightConfig {
  seed: number;
  secondsPerHour: number;
  hours: number;
  gpt: {
    firstContactAt: number;
    /** Contact gap range [min, max] in seconds, indexed by in-game hour (0 = 12 AM). */
    gapByHour: ReadonlyArray<readonly [number, number]>;
    /** Response window in seconds, indexed by in-game hour. */
    windowByHour: readonly number[];
    linkHold: number;
  };
  seal: {
    heatGainShut: number;
    coolOpen: number;
    forceOpenAt: number;
    relockBelow: number;
    warnAt: number;
  };
}

/**
 * Night 1 demo tuning. Only GPT is aggressive; it ramps up through the night.
 * The first contact waits for Amos to finish walking Milo through the terminal.
 */
export const NIGHT_ONE: NightConfig = {
  seed: 1971,
  secondsPerHour: 60,
  hours: 6,
  gpt: {
    firstContactAt: 72,
    gapByHour: [
      [40, 50],
      [38, 48],
      [34, 44],
      [30, 40],
      [27, 36],
      [24, 32],
    ],
    windowByHour: [12, 12, 11, 10, 9, 8],
    linkHold: 6,
  },
  seal: {
    heatGainShut: 1.25,
    coolOpen: 4,
    forceOpenAt: 100,
    relockBelow: 40,
    warnAt: 75,
  },
};
