/** Mulberry32: small, fast, deterministic PRNG so a seeded night always plays the same. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rangeFrom(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}
