export interface RngState {
  seed: number;
  calls: number;
}

const UINT32_MAX = 0xffffffff;

const toSeed = (seed: string | number): number => {
  if (typeof seed === 'number') {
    return seed >>> 0;
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const next = (state: RngState): number => {
  const x = state.seed + state.calls * 0x6d2b79f5;
  const t = Math.imul(x ^ (x >>> 15), 1 | x);
  const r = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) >>> 0;
  state.calls += 1;
  return r / (UINT32_MAX + 1);
};

export interface Rng {
  state: RngState;
  next: () => number;
  shuffle: <T>(values: T[]) => T[];
}

export const createRng = (seed: string | number): Rng => {
  const state: RngState = { seed: toSeed(seed), calls: 0 };
  return {
    state,
    next: () => next(state),
    shuffle: <T>(values: T[]) => {
      const arr = values.slice();
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next(state) * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  };
};

export const cloneRngState = (state: RngState): RngState => ({
  seed: state.seed,
  calls: state.calls
});

export const restoreRng = (saved: RngState): Rng => {
  const rng = createRng(saved.seed);
  rng.state.calls = saved.calls;
  return rng;
};
