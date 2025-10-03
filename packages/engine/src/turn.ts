import { activePlayerIndices, currentPlayer, advanceIndex } from "./state";
import { GameState, MatchPlayer } from "./types";

export function nextPlayerIndex(state: GameState, steps = 1): number {
  const indices = activePlayerIndices(state);
  if (indices.length === 0) {
    return 0;
  }
  const currentIdx = state.currentPlayerIndex;
  const currentPos = indices.indexOf(currentIdx);
  if (currentPos === -1) {
    return indices[0];
  }
  const len = indices.length;
  const delta = steps * (state.direction === 1 ? 1 : -1);
  const nextPos = ((currentPos + delta) % len + len) % len;
  return indices[nextPos];
}

export function getNextPlayer(state: GameState, steps = 1): MatchPlayer {
  const idx = nextPlayerIndex(state, steps);
  return state.players[idx];
}

export function advanceTurn(state: GameState, skipCount = 0): void {
  const steps = skipCount + 1;
  advanceIndex(state, steps);
}

export function getTurnOrder(state: GameState): MatchPlayer[] {
  return activePlayerIndices(state).map((idx) => state.players[idx]);
}

export function isPlayersTurn(state: GameState, playerId: string): boolean {
  return currentPlayer(state).id === playerId;
}
