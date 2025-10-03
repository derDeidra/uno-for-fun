import { buildDeck, DeckData, resetDeckCounter } from './deck';
import { createRng, RngState, cloneRngState, restoreRng } from './rng';
import {
  Card,
  Color,
  GameStatus,
  PendingDrawState,
  PendingUnoState,
  PlayerID,
  RuleSet
} from './types';
import { getFace } from './card';

export interface PlayerState {
  id: PlayerID;
  name: string;
  hand: string[];
  connected: boolean;
  unoDeclared: boolean;
}

export interface GameState {
  status: GameStatus;
  ruleSet: RuleSet;
  players: PlayerState[];
  spectators: PlayerID[];
  drawPile: string[];
  discardPile: string[];
  cards: Record<string, Card>;
  activeSide: 'light' | 'dark';
  currentColor: Color | null;
  currentPlayerIndex: number;
  direction: 1 | -1;
  pendingDraw: PendingDrawState | null;
  pendingUno: PendingUnoState[];
  rng: RngState;
  turn: number;
  winnerIds: PlayerID[];
  jumpQueue: PlayerID[];
  startingHandSize: number;
  seed: string | number;
  history: string[];
}

export interface CreateGameOptions {
  players: Array<{ id: PlayerID; name: string }>;
  ruleSet: RuleSet;
  seed: string | number;
  startingHandSize?: number;
}

const drawCardFromPile = (drawPile: string[]): string => {
  const card = drawPile.pop();
  if (!card) {
    throw new Error('Draw pile exhausted');
  }
  return card;
};

const ensureStarterCard = (
  deck: DeckData,
  drawPile: string[],
  side: 'light' | 'dark'
): string => {
  while (drawPile.length > 0) {
    const candidate = drawPile.pop()!;
    const face = getFace(deck.cards[candidate], side);
    if (face.kind === 'wild' && face.action !== 'wild') {
      // Put it back to bottom and continue
      drawPile.unshift(candidate);
      continue;
    }
    return candidate;
  }
  throw new Error('Unable to find starter card');
};

export const createGameState = ({
  players,
  ruleSet,
  seed,
  startingHandSize = 7
}: CreateGameOptions): GameState => {
  if (players.length < 2 || players.length > 8) {
    throw new Error('Game requires between 2 and 8 players');
  }
  resetDeckCounter();
  const rng = createRng(seed);
  const deck = buildDeck(ruleSet, rng);
  if (deck.drawPile.length === 0) {
    throw new Error('Empty deck for variant ' + ruleSet.variant);
  }
  const drawPile = deck.drawPile.slice();
  const playerStates: PlayerState[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    hand: [],
    connected: true,
    unoDeclared: false
  }));

  for (let cardIndex = 0; cardIndex < startingHandSize; cardIndex += 1) {
    playerStates.forEach((player, idx) => {
      player.hand.push(drawCardFromPile(drawPile));
    });
  }

  const activeSide: 'light' | 'dark' = 'light';
  const starterCard = ensureStarterCard(deck, drawPile, activeSide);
  const discardPile = [starterCard];
  const starterFace = getFace(deck.cards[starterCard], activeSide);
  const currentColor = starterFace.kind === 'wild' ? null : starterFace.color;

  return {
    status: 'inProgress',
    ruleSet,
    players: playerStates,
    spectators: [],
    drawPile,
    discardPile,
    cards: deck.cards,
    activeSide,
    currentColor,
    currentPlayerIndex: 0,
    direction: 1,
    pendingDraw: null,
    pendingUno: [],
    rng: cloneRngState(rng.state),
    turn: 0,
    winnerIds: [],
    jumpQueue: [],
    startingHandSize,
    seed,
    history: []
  };
};

export const getCurrentPlayer = (state: GameState) => state.players[state.currentPlayerIndex];

export const cloneState = (state: GameState): GameState =>
  JSON.parse(JSON.stringify(state)) as GameState;

export const reorderPlayers = (state: GameState, newOrder: PlayerID[]): GameState => {
  const playerMap = new Map(state.players.map((player) => [player.id, player] as const));
  const ordered = newOrder.map((id) => {
    const player = playerMap.get(id);
    if (!player) throw new Error('Unknown player');
    return { ...player, hand: player.hand.slice() };
  });
  return {
    ...state,
    players: ordered
  };
};

export const nextPlayerIndex = (state: GameState, steps = 1): number => {
  const count = state.players.length;
  let idx = state.currentPlayerIndex;
  for (let i = 0; i < steps; i += 1) {
    idx = (idx + state.direction + count) % count;
  }
  return idx;
};

export const advanceTurn = (state: GameState, steps = 1): GameState => ({
  ...state,
  currentPlayerIndex: nextPlayerIndex(state, steps),
  turn: state.turn + 1
});

export const drawCards = (state: GameState, playerId: PlayerID, count: number): { state: GameState; cards: string[] } => {
  if (count <= 0) return { state, cards: [] };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Player not found');
  const newState = cloneState(state);
  const target = newState.players.find((p) => p.id === playerId)!;
  const drawn: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (newState.drawPile.length === 0) {
      const rng = restoreRng(newState.rng);
      const topDiscard = newState.discardPile[newState.discardPile.length - 1];
      const rest = newState.discardPile.slice(0, -1);
      newState.drawPile = rng.shuffle(rest);
      newState.discardPile = topDiscard ? [topDiscard] : [];
      newState.rng = cloneRngState(rng.state);
    }
    const card = drawCardFromPile(newState.drawPile);
    drawn.push(card);
    target.hand.push(card);
    target.unoDeclared = false;
  }
  return { state: newState, cards: drawn };
};

export const hasWon = (player: PlayerState): boolean => player.hand.length === 0;
