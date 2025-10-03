import { getCardFaceByActive } from "./card";
import { findPlayer } from "./deck";
import {
  ActionType,
  CardFace,
  CardInstance,
  GameState,
  MatchPlayer,
  PlayCardOptions,
  RuleSet,
} from "./types";

function isDrawAction(action?: ActionType | null): boolean {
  return action === "DrawTwo" || action === "DrawFive" || action === "WildDrawFour" || action === "WildDrawFive";
}

function canStack(ruleSet: RuleSet, currentStack: GameState["drawStack"], face: CardFace): boolean {
  if (!currentStack) {
    return true;
  }
  if (!face.drawCount || !face.action) {
    return false;
  }
  if (!isDrawAction(face.action)) {
    return false;
  }
  if (ruleSet.stacking === "off") {
    return false;
  }
  if (ruleSet.stacking === "sameTypeOnly") {
    return currentStack.lastAction === face.action;
  }
  return true;
}

function matchesTop(state: GameState, face: CardFace, chosenColor?: string): boolean {
  const top = state.discardPile[state.discardPile.length - 1];
  const topFace = top ? getCardFaceByActive(top, state.activeFace) : undefined;
  if (!topFace) {
    return true;
  }
  const enforcedColor = chosenColor ?? (state.currentColor === "Wild" ? undefined : state.currentColor);
  if (enforcedColor) {
    if (face.color === enforcedColor) {
      return true;
    }
  }
  if (face.kind === "wild") {
    return true;
  }
  if (topFace.kind === "wild") {
    return enforcedColor ? face.color === enforcedColor : true;
  }
  if (face.color === topFace.color) {
    return true;
  }
  if (face.kind === "number" && topFace.kind === "number" && face.value === topFace.value) {
    return true;
  }
  if (face.action && topFace.action && face.action === topFace.action) {
    return true;
  }
  return false;
}

export function isPlayableCard(
  state: GameState,
  player: MatchPlayer,
  card: CardInstance,
  options: PlayCardOptions = {}
): boolean {
  const face = getCardFaceByActive(card, state.activeFace);
  const drawStack = state.drawStack;
  if (drawStack && !canStack(state.ruleSet, drawStack, face)) {
    return false;
  }
  if (face.kind === "wild" && face.action && isDrawAction(face.action)) {
    if (!face.drawCount) {
      return false;
    }
  }
  if (face.kind === "wild" && !options.chosenColor && face.color === "Wild") {
    if (!face.wildPlayableColors || face.wildPlayableColors.length === 0) {
      return true;
    }
  }
  return matchesTop(state, face, options.chosenColor);
}

export function playerHasPlayableCard(state: GameState, playerId: string): boolean {
  const player = findPlayer(state, playerId);
  return player.hand.cards.some((card) => isPlayableCard(state, player, card));
}

export function identicalFace(a: CardInstance, b: CardInstance, state: GameState): boolean {
  const faceA = getCardFaceByActive(a, state.activeFace);
  const faceB = getCardFaceByActive(b, state.activeFace);
  if (faceA.kind !== faceB.kind) {
    return false;
  }
  if (faceA.kind === "number") {
    return faceA.color === faceB.color && faceA.value === faceB.value;
  }
  if (faceA.kind === "action") {
    return faceA.color === faceB.color && faceA.action === faceB.action;
  }
  return faceA.action === faceB.action;
}

export function computeJumpInEligible(state: GameState, playedCard: CardInstance): string[] {
  if (!state.ruleSet.jumpIn.enabled) {
    return [];
  }
  const face = getCardFaceByActive(playedCard, state.activeFace);
  if (face.kind === "wild" && !state.ruleSet.jumpIn.allowOnWildResolution) {
    return [];
  }
  const eligible: string[] = [];
  for (const player of state.players) {
    if (player.id === playedCard.ownerId || player.isSpectator) {
      continue;
    }
    if (player.hand.cards.some((card) => identicalFace(card, playedCard, state))) {
      eligible.push(player.id);
    }
  }
  return eligible;
}

export function requirePlayableCard(state: GameState, playerId: string): void {
  const player = findPlayer(state, playerId);
  if (!playerHasPlayableCard(state, playerId)) {
    throw new Error("No playable cards");
  }
}
