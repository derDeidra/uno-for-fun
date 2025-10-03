import { SeedState } from "./types";

const UINT32_MAX = 0xffffffff;

function stringToSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 0x12345678;
}

function mulberry32(a: number): () => number {
  let t = a >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / (UINT32_MAX + 1);
  };
}

export function createSeedState(seed: string): SeedState {
  return { seed, counter: 0 };
}

export function nextFloat(rng: SeedState): number {
  const basis = stringToSeed(`${rng.seed}:${rng.counter}`);
  const generator = mulberry32(basis);
  rng.counter += 1;
  return generator();
}

export function nextInt(rng: SeedState, maxExclusive: number): number {
  if (maxExclusive <= 0) {
    throw new Error("maxExclusive must be positive");
  }
  return Math.floor(nextFloat(rng) * maxExclusive);
}

export function shuffleInPlace<T>(items: T[], rng: SeedState): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = nextInt(rng, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export function takeRandom<T>(items: T[], rng: SeedState): T {
  if (items.length === 0) {
    throw new Error("Cannot take from empty array");
  }
  const index = nextInt(rng, items.length);
  return items.splice(index, 1)[0];
}
