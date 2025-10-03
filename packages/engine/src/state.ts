import { buildDeck, dealInitialHands, placeInitialDiscard } from "./deck";
import {
  GameState,
  MatchPlayer,
  PlayerHand,
  RuleSet,
  SeedState,
  TurnDirection,
} from "./types";
import { createSeedState } from "./rng";

function generateId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function touch(state: GameState): void {
  state.updatedAt = Date.now();
}

export function createGameState(ruleSet: RuleSet, seed = `${Date.now()}`): GameState {
  const rng: SeedState = createSeedState(seed);
  const now = Date.now();
  return {
    id: generateId("game"),
    createdAt: now,
    updatedAt: now,
    phase: "lobby",
    turnPhase: "awaitingAction",
    activeFace: "light",
    currentColor: "Wild",
    players: [],
    currentPlayerIndex: 0,
    direction: 1,
    drawPile: [],
    discardPile: [],
    pendingEffects: [],
    ruleSet,
    rng,
    winnerIds: [],
  };
}

export function addPlayer(state: GameState, id: string, name: string, spectator = false): void {
  if (state.phase !== "lobby") {
    throw new Error("Cannot join; game already started");
  }
  if (state.players.some((p) => p.id === id)) {
    throw new Error("Player already registered");
  }
  if (!spectator) {
    const activePlayers = state.players.filter((p) => !p.isSpectator).length;
    if (activePlayers >= 8) {
      throw new Error("Room full");
    }
  }
  const hand: PlayerHand = { playerId: id, cards: [], unoDeclared: false };
  const player: MatchPlayer = {
    id,
    name,
    connected: true,
    hand,
    isSpectator: spectator,
  };
  state.players.push(player);
  touch(state);
}

export function removePlayer(state: GameState, playerId: string): void {
  state.players = state.players.filter((p) => p.id !== playerId);
  if (state.currentPlayerIndex >= state.players.length) {
    state.currentPlayerIndex = 0;
  }
  touch(state);
}

export function setPlayerConnection(state: GameState, playerId: string, connected: boolean): void {
  const player = state.players.find((p) => p.id === playerId);
  if (player) {
    player.connected = connected;
    touch(state);
  }
}

export function updateRuleSet(state: GameState, ruleSet: RuleSet): void {
  if (state.phase !== "lobby") {
    throw new Error("Cannot change rules mid-game");
  }
  state.ruleSet = ruleSet;
  touch(state);
}

export function startGame(state: GameState): void {
  if (state.phase !== "lobby") {
    throw new Error("Game already started");
  }
  const activePlayers = state.players.filter((p) => !p.isSpectator);
  if (activePlayers.length < 2) {
    throw new Error("At least two players required");
  }
  state.drawPile = buildDeck(state.ruleSet, state.rng);
  state.discardPile = [];
  state.activeFace = "light";
  state.currentColor = "Wild";
  state.direction = 1;
  state.pendingEffects = [];
  state.winnerIds = [];
  state.turnPhase = "awaitingAction";
  state.currentPlayerIndex = state.players.indexOf(activePlayers[0]);

  dealInitialHands(state, 7);
  placeInitialDiscard(state);
  state.phase = "inGame";
  touch(state);
}

export function endGame(state: GameState, winnerIds: string[]): void {
  state.phase = "finished";
  state.winnerIds = winnerIds;
  touch(state);
}

export function currentPlayer(state: GameState): MatchPlayer {
  if (state.players.length === 0) {
    throw new Error("No players in game");
  }
  return state.players[state.currentPlayerIndex % state.players.length];
}

export function activePlayerIndices(state: GameState): number[] {
  return state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !player.isSpectator)
    .map(({ index }) => index);
}

export function advanceIndex(state: GameState, steps = 1): void {
  const activeIndices = activePlayerIndices(state);
  if (activeIndices.length === 0) {
    return;
  }
  const currentIdx = state.currentPlayerIndex;
  const currentPos = activeIndices.indexOf(currentIdx);
  if (currentPos === -1) {
    state.currentPlayerIndex = activeIndices[0];
    touch(state);
    return;
  }
  const len = activeIndices.length;
  const delta = steps * (state.direction === 1 ? 1 : -1);
  const nextPos = ((currentPos + delta) % len + len) % len;
  state.currentPlayerIndex = activeIndices[nextPos];
  touch(state);
}

export function setDirection(state: GameState, direction: TurnDirection): void {
  state.direction = direction;
  touch(state);
}

export function toggleDirection(state: GameState): void {
  state.direction = state.direction === 1 ? -1 : 1;
  touch(state);
}

export function setTurnPhase(state: GameState, phase: GameState["turnPhase"]): void {
  state.turnPhase = phase;
  touch(state);
}

export function setActiveFace(state: GameState, face: GameState["activeFace"]): void {
  state.activeFace = face;
  touch(state);
}

export function setCurrentColor(state: GameState, color: GameState["currentColor"]): void {
  state.currentColor = color;
  touch(state);
}
