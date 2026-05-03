export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export interface OneEuroState {
  hatX: number;
  hatDx: number;
  lastTimeMs: number;
  initialized: boolean;
}

export const createOneEuroState = (): OneEuroState => ({
  hatX: 0,
  hatDx: 0,
  lastTimeMs: 0,
  initialized: false,
});

const smoothingAlpha = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export type OneEuroFilter = (state: OneEuroState, value: number, timeMs: number) => number;

export const createOneEuroFilter = (params: OneEuroParams): OneEuroFilter => {
  return (state, value, timeMs) => {
    if (!state.initialized) {
      state.initialized = true;
      state.lastTimeMs = timeMs;
      state.hatX = value;
      state.hatDx = 0;
      return value;
    }
    const dt = Math.max((timeMs - state.lastTimeMs) / 1000, 1e-6);
    state.lastTimeMs = timeMs;

    const dx = (value - state.hatX) / dt;
    const alphaD = smoothingAlpha(params.dCutoff, dt);
    state.hatDx = alphaD * dx + (1 - alphaD) * state.hatDx;

    const cutoff = params.minCutoff + params.beta * Math.abs(state.hatDx);
    const alpha = smoothingAlpha(cutoff, dt);
    state.hatX = alpha * value + (1 - alpha) * state.hatX;

    return state.hatX;
  };
};
