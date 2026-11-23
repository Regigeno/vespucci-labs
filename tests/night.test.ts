import { describe, expect, it } from "vitest";
import { NIGHT_ONE, type NightConfig } from "../src/sim/config";
import { NightSim, clockLabel } from "../src/sim/night";
import type { NightInput, SimEvent } from "../src/sim/types";

const idle: NightInput = { holdLink: false, sealCommand: null };

function config(overrides: Partial<NightConfig["gpt"]> = {}): NightConfig {
  return {
    ...NIGHT_ONE,
    gpt: {
      ...NIGHT_ONE.gpt,
      firstContactAt: 5,
      gapByHour: NIGHT_ONE.gpt.gapByHour.map(() => [20, 20] as const),
      windowByHour: NIGHT_ONE.gpt.windowByHour.map(() => 10),
      ...overrides,
    },
  };
}

function run(sim: NightSim, seconds: number, input: NightInput = idle): SimEvent[] {
  return sim.tick(seconds, input);
}

function types(events: SimEvent[]): string[] {
  return events.map((e) => e.type);
}

describe("night cycle", () => {
  it("formats the clock from 12:00 AM to 6:00 AM", () => {
    expect(clockLabel(0, 60)).toBe("12:00 AM");
    expect(clockLabel(30, 60)).toBe("12:30 AM");
    expect(clockLabel(61, 60)).toBe("1:01 AM");
    expect(clockLabel(359.9, 60)).toBe("5:59 AM");
  });

  it("reaches dawn after six in-game hours and stops ticking", () => {
    const sim = new NightSim({ ...config(), gpt: { ...config().gpt, firstContactAt: 10_000 } });
    const events = run(sim, 360);
    expect(types(events).filter((t) => t === "hour")).toHaveLength(5);
    expect(types(events)).toContain("dawn");
    expect(sim.state.phase).toBe("dawn");
    expect(run(sim, 10)).toEqual([]);
  });

  it("starts with every agent in its home cell and the seal open and cool", () => {
    const sim = new NightSim(NIGHT_ONE);
    expect(sim.state.locations.gpt).toBe("cell_gpt");
    expect(sim.state.locations.inkling).toBe("cell_inkling");
    expect(sim.state.seal).toEqual({ shut: false, heat: 0, forcedOpen: false });
  });
});

describe("GPT contact", () => {
  it("opens the first contact on schedule", () => {
    const sim = new NightSim(config());
    expect(types(run(sim, 4.9))).not.toContain("contactOpened");
    expect(types(run(sim, 0.2))).toContain("contactOpened");
    expect(sim.state.gpt.contact).not.toBeNull();
  });

  it("advances GPT one node per missed contact and breaches an open office", () => {
    const sim = new NightSim(config());
    run(sim, 5.1);
    run(sim, 10);
    expect(sim.state.locations.gpt).toBe("spine");
    run(sim, 30);
    expect(sim.state.locations.gpt).toBe("airlock");
    const events = run(sim, 30);
    expect(types(events)).toContain("breach");
    expect(sim.state.phase).toBe("breached");
    expect(sim.state.breachedBy).toBe("gpt");
  });

  it("is blocked by a shut seal at the airlock", () => {
    const sim = new NightSim(config());
    sim.state.locations.gpt = "airlock";
    run(sim, 0, { holdLink: false, sealCommand: "shut" });
    const events = run(sim, 15.2);
    expect(types(events)).toContain("entryBlocked");
    expect(sim.state.locations.gpt).toBe("airlock");
    expect(sim.state.phase).toBe("active");
  });

  it("retreats GPT one node when the link is held for the full duration", () => {
    const sim = new NightSim(config());
    sim.state.locations.gpt = "airlock";
    run(sim, 5.1);
    const events = run(sim, 6, { holdLink: true, sealCommand: null });
    expect(types(events)).toContain("linkCompleted");
    expect(sim.state.locations.gpt).toBe("spine");
    expect(sim.state.gpt.contact).toBeNull();
  });

  it("keeps GPT home when a link completes in its cell", () => {
    const sim = new NightSim(config());
    run(sim, 5.1);
    run(sim, 6, { holdLink: true, sealCommand: null });
    expect(sim.state.locations.gpt).toBe("cell_gpt");
    expect(sim.state.gpt.linksCompleted).toBe(1);
  });

  it("resets link progress when the hold is released early", () => {
    const sim = new NightSim(config());
    run(sim, 5.1);
    run(sim, 3, { holdLink: true, sealCommand: null });
    expect(sim.state.gpt.linkProgress).toBeGreaterThan(2.9);
    const events = run(sim, 0.1);
    expect(types(events)).toContain("linkBroken");
    expect(sim.state.gpt.linkProgress).toBe(0);
  });

  it("resolves a link that completes on the deadline tick in the player's favour", () => {
    const sim = new NightSim(config({ windowByHour: NIGHT_ONE.gpt.windowByHour.map(() => 6) }));
    sim.state.locations.gpt = "airlock";
    run(sim, 5);
    const events = run(sim, 6, { holdLink: true, sealCommand: null });
    expect(types(events)).toContain("linkCompleted");
    expect(types(events)).not.toContain("breach");
    expect(sim.state.locations.gpt).toBe("spine");
  });

  it("is deterministic for a given seed", () => {
    const answerAll = (sim: NightSim) => {
      const opened: SimEvent[] = [];
      while (sim.state.phase === "active") {
        const events = sim.tick(0.1, { holdLink: sim.state.gpt.contact !== null, sealCommand: null });
        opened.push(...events.filter((e) => e.type === "contactOpened"));
      }
      return opened;
    };
    const ea = answerAll(new NightSim(NIGHT_ONE));
    const eb = answerAll(new NightSim(NIGHT_ONE));
    expect(ea).toEqual(eb);
    expect(ea.length).toBeGreaterThan(5);
  });

  it("an idle player is breached before dawn", () => {
    const sim = new NightSim(NIGHT_ONE);
    run(sim, 360);
    expect(sim.state.phase).toBe("breached");
  });

  it("a player who answers every contact survives to dawn", () => {
    const sim = new NightSim(NIGHT_ONE);
    while (sim.state.phase === "active") {
      sim.tick(0.1, { holdLink: sim.state.gpt.contact !== null, sealCommand: null });
    }
    expect(sim.state.phase).toBe("dawn");
    expect(sim.state.locations.gpt).toBe("cell_gpt");
  });
});

describe("seal", () => {
  it("heats while shut and cools while open", () => {
    const sim = new NightSim({ ...config(), gpt: { ...config().gpt, firstContactAt: 10_000 } });
    run(sim, 0, { holdLink: false, sealCommand: "shut" });
    run(sim, 20);
    expect(sim.state.seal.heat).toBeCloseTo(25, 1);
    run(sim, 0, { holdLink: false, sealCommand: "open" });
    run(sim, 5);
    expect(sim.state.seal.heat).toBeCloseTo(5, 1);
  });

  it("forces open at 100% and refuses to shut again until below 40%", () => {
    const sim = new NightSim({ ...config(), gpt: { ...config().gpt, firstContactAt: 10_000 } });
    run(sim, 0, { holdLink: false, sealCommand: "shut" });
    const events = run(sim, 80.1);
    expect(types(events)).toContain("heatWarning");
    expect(types(events)).toContain("sealForcedOpen");
    expect(sim.state.seal.shut).toBe(false);
    expect(sim.state.seal.forcedOpen).toBe(true);

    const rejected = run(sim, 0, { holdLink: false, sealCommand: "shut" });
    expect(types(rejected)).toContain("sealRejected");
    expect(sim.state.seal.shut).toBe(false);

    const cooled = run(sim, 15.1);
    expect(types(cooled)).toContain("sealRelockable");
    run(sim, 0, { holdLink: false, sealCommand: "shut" });
    expect(sim.state.seal.shut).toBe(true);
  });

  it("ignores seal commands while a link is being held", () => {
    const sim = new NightSim(config());
    run(sim, 5.1);
    run(sim, 1, { holdLink: true, sealCommand: null });
    const events = run(sim, 0.1, { holdLink: true, sealCommand: "shut" });
    expect(types(events)).toContain("sealRejected");
    expect(sim.state.seal.shut).toBe(false);
  });
});
