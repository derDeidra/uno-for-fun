import { getCardFaceByActive } from "./card";
import { drawToPlayer, findPlayer } from "./deck";
import {
  EffectDraw,
  EffectFlip,
  EffectRotateHands,
  EffectSkip,
  EffectSwapHands,
  GameState,
  PendingEffect,
} from "./types";
import { setActiveFace, setCurrentColor, toggleDirection } from "./state";

export function enqueueEffect(state: GameState, effect: PendingEffect): void {
  state.pendingEffects.push(effect);
}

function activePlayerCount(state: GameState): number {
  return state.players.filter((p) => !p.isSpectator).length;
}

function applyDraw(state: GameState, effect: EffectDraw): number {
  drawToPlayer(state, effect.targetPlayerId, effect.amount);
  return 1; // draws remove the player's turn
}

function applySkip(_state: GameState, effect: EffectSkip): number {
  return effect.targetCount;
}

function applyFlip(state: GameState): number {
  const nextFace = state.activeFace === "light" ? "dark" : "light";
  setActiveFace(state, nextFace);
  const top = state.discardPile[state.discardPile.length - 1];
  if (top) {
    const face = getCardFaceByActive(top, state.activeFace);
    setCurrentColor(state, face.color);
  }
  return 0;
}

function applySwapHands(state: GameState, effect: EffectSwapHands): number {
  const source = findPlayer(state, effect.sourcePlayerId);
  const target = findPlayer(state, effect.targetPlayerId);
  const sourceCards = source.hand.cards;
  const targetCards = target.hand.cards;
  source.hand.cards = targetCards;
  target.hand.cards = sourceCards;
  source.hand.cards.forEach((card) => (card.ownerId = source.id));
  target.hand.cards.forEach((card) => (card.ownerId = target.id));
  source.hand.unoDeclared = source.hand.cards.length === 1 ? source.hand.unoDeclared : false;
  target.hand.unoDeclared = target.hand.cards.length === 1 ? target.hand.unoDeclared : false;
  return 0;
}

function applyRotateHands(state: GameState, effect: EffectRotateHands): number {
  const activePlayers = state.players.filter((p) => !p.isSpectator);
  if (activePlayers.length <= 1) {
    return 0;
  }
  const cardSets = activePlayers.map((p) => p.hand.cards);
  if (effect.direction === 1) {
    const last = cardSets.pop();
    if (last) {
      cardSets.unshift(last);
    }
  } else {
    const first = cardSets.shift();
    if (first) {
      cardSets.push(first);
    }
  }
  cardSets.forEach((cards, idx) => {
    const player = activePlayers[idx];
    player.hand.cards = cards;
    player.hand.cards.forEach((card) => (card.ownerId = player.id));
    if (player.hand.cards.length !== 1) {
      player.hand.unoDeclared = false;
    }
  });
  return 0;
}

export function resolveEffects(state: GameState): number {
  let skipAccumulator = 0;
  while (state.pendingEffects.length > 0) {
    const effect = state.pendingEffects.shift();
    if (!effect) {
      continue;
    }
    switch (effect.type) {
      case "draw":
        skipAccumulator += applyDraw(state, effect);
        break;
      case "skip":
        skipAccumulator += applySkip(state, effect);
        break;
      case "reverse":
        toggleDirection(state);
        if (activePlayerCount(state) === 2) {
          skipAccumulator += 1;
        }
        break;
      case "flip":
        skipAccumulator += applyFlip(state);
        break;
      case "swapHands":
        skipAccumulator += applySwapHands(state, effect);
        break;
      case "rotateHands":
        skipAccumulator += applyRotateHands(state, effect);
        break;
      default:
        break;
    }
  }
  return skipAccumulator;
}

export function flushDrawStack(state: GameState, targetPlayerId: string): number {
  const stack = state.drawStack;
  if (!stack) {
    return 0;
  }
  drawToPlayer(state, targetPlayerId, stack.amount);
  state.drawStack = undefined;
  return 1;
}

export function evaluateVictory(state: GameState): string[] {
  const winners = state.players
    .filter((player) => !player.isSpectator && player.hand.cards.length === 0)
    .map((player) => player.id);
  return winners;
}
