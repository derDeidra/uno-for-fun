import { createBaseDeck, createUnoFlipDeck, instantiateDeck, getCardFaceByActive } from "./card";
import { GameState, MatchPlayer, RuleSet, CardInstance, Color, WildColor } from "./types";
import { shuffleInPlace } from "./rng";

export function buildDeck(ruleSet: RuleSet, seedState: GameState["rng"]): CardInstance[] {
  const dualCards = ruleSet.variant === "unoFlip" ? createUnoFlipDeck() : createBaseDeck();
  return instantiateDeck(dualCards, seedState);
}

export function ensureDrawPile(state: GameState): void {
  if (state.drawPile.length > 0) {
    return;
  }
  if (state.discardPile.length <= 1) {
    throw new Error("Cannot refill draw pile; insufficient cards");
  }
  const top = state.discardPile[state.discardPile.length - 1];
  const replenish = state.discardPile.slice(0, -1).map((card) => ({ ...card }));
  state.discardPile = [top];
  shuffleInPlace(replenish, state.rng);
  state.drawPile.push(...replenish);
}

export function drawFromPile(state: GameState, amount: number): CardInstance[] {
  const drawn: CardInstance[] = [];
  for (let i = 0; i < amount; i += 1) {
    ensureDrawPile(state);
    const card = state.drawPile.pop();
    if (!card) {
      throw new Error("Draw pile unexpectedly empty");
    }
    drawn.push(card);
  }
  return drawn;
}

export function dealInitialHands(state: GameState, handSize: number): void {
  for (let round = 0; round < handSize; round += 1) {
    for (const player of state.players) {
      const [card] = drawFromPile(state, 1);
      card.ownerId = player.id;
      player.hand.cards.push(card);
    }
  }
}

export function placeInitialDiscard(state: GameState): void {
  ensureDrawPile(state);
  let candidate: CardInstance | undefined;
  while (!candidate) {
    const top = state.drawPile.pop();
    if (!top) {
      throw new Error("Failed to draw initial discard");
    }
    const face = getCardFaceByActive(top, state.activeFace);
    if (face.kind === "wild" && face.action?.startsWith("WildDraw")) {
      state.drawPile.unshift(top);
      shuffleInPlace(state.drawPile, state.rng);
      continue;
    }
    candidate = top;
    state.currentColor = face.color as Color | WildColor;
  }
  state.discardPile.push(candidate);
}

export function findPlayer(state: GameState, playerId: string): MatchPlayer {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }
  return player;
}

export function drawToPlayer(state: GameState, playerId: string, amount: number): CardInstance[] {
  const player = findPlayer(state, playerId);
  const cards = drawFromPile(state, amount);
  for (const card of cards) {
    card.ownerId = playerId;
  }
  player.hand.cards.push(...cards);
  return cards;
}
