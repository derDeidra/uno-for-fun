import { getCardFaceByActive } from "./card";
import { drawFromPile, drawToPlayer, findPlayer } from "./deck";
import {
  GameState,
  MatchPlayer,
  PlayCardOptions,
  CardInstance,
  Color,
  WildColor,
} from "./types";
import { isPlayableCard, playerHasPlayableCard, computeJumpInEligible } from "./rules";
import {
  enqueueEffect,
  resolveEffects,
  flushDrawStack,
  evaluateVictory,
} from "./effects";
import {
  currentPlayer,
  setCurrentColor,
  setTurnPhase,
  activePlayerIndices,
} from "./state";
import { advanceTurn, getNextPlayer } from "./turn";

function ensureInGame(state: GameState): void {
  if (state.phase !== "inGame") {
    throw new Error("Game not in progress");
  }
}

function removeCardFromHand(player: MatchPlayer, cardId: string): CardInstance {
  const idx = player.hand.cards.findIndex((card) => card.id === cardId);
  if (idx === -1) {
    throw new Error("Card not in hand");
  }
  const [card] = player.hand.cards.splice(idx, 1);
  return card;
}

function updateUnoFlag(player: MatchPlayer, auto: boolean): void {
  if (player.hand.cards.length === 1 && auto) {
    player.hand.unoDeclared = true;
  } else if (player.hand.cards.length >= 2) {
    player.hand.unoDeclared = false;
  }
}

function applyChosenColor(
  state: GameState,
  card: CardInstance,
  chosenColor?: Color
): Color | WildColor {
  const face = getCardFaceByActive(card, state.activeFace);
  if (face.kind === "wild") {
    const allowed = face.wildPlayableColors ?? [];
    if (!chosenColor && face.color === "Wild") {
      throw new Error("Wild card requires choosing a color");
    }
    if (chosenColor && allowed.length > 0 && !allowed.includes(chosenColor)) {
      throw new Error("Chosen color not allowed");
    }
    if (chosenColor) {
      setCurrentColor(state, chosenColor);
      return chosenColor;
    }
  }
  setCurrentColor(state, face.color);
  return face.color;
}

function queueActionEffects(
  state: GameState,
  player: MatchPlayer,
  card: CardInstance,
  options: PlayCardOptions
): void {
  const face = getCardFaceByActive(card, state.activeFace);
  if (face.kind === "action" || face.kind === "wild") {
    switch (face.action) {
      case "Skip":
        enqueueEffect(state, {
          type: "skip",
          targetCount: 1,
          sourceCardId: card.id,
        });
        break;
      case "SkipAll": {
        const activeCount = activePlayerIndices(state).length;
        enqueueEffect(state, {
          type: "skip",
          targetCount: Math.max(activeCount - 1, 0),
          sourceCardId: card.id,
        });
        break;
      }
      case "Reverse":
        enqueueEffect(state, { type: "reverse", sourceCardId: card.id });
        break;
      case "Flip":
        enqueueEffect(state, { type: "flip", sourceCardId: card.id });
        break;
      case "SwapHands": {
        const target = options.targetPlayerId;
        if (!target) {
          throw new Error("SwapHands requires target");
        }
        enqueueEffect(state, {
          type: "swapHands",
          sourcePlayerId: player.id,
          targetPlayerId: target,
          sourceCardId: card.id,
        });
        break;
      }
      case "RotateHands":
        enqueueEffect(state, {
          type: "rotateHands",
          direction: state.direction,
          sourceCardId: card.id,
        });
        break;
      default:
        break;
    }
  }

  if (face.drawCount && face.drawCount > 0) {
    if (state.ruleSet.stacking === "off") {
      const next = getNextPlayer(state, 1);
      enqueueEffect(state, {
        type: "draw",
        targetPlayerId: next.id,
        amount: face.drawCount,
        sourceCardId: card.id,
      });
      state.drawStack = undefined;
    } else {
      if (!state.drawStack) {
        state.drawStack = {
          amount: face.drawCount,
          sourceCardId: card.id,
          lastAction: face.action ?? null,
        };
      } else {
        state.drawStack.amount += face.drawCount;
        state.drawStack.sourceCardId = card.id;
        state.drawStack.lastAction = face.action ?? state.drawStack.lastAction;
      }
    }
  }

  if (state.ruleSet.sevenZero && face.kind === "number") {
    if (face.value === 7) {
      const target = options.targetPlayerId;
      if (!target) {
        throw new Error("Playing a seven requires selecting a target");
      }
      enqueueEffect(state, {
        type: "swapHands",
        sourcePlayerId: player.id,
        targetPlayerId: target,
        sourceCardId: card.id,
      });
    }
    if (face.value === 0) {
      enqueueEffect(state, {
        type: "rotateHands",
        direction: state.direction,
        sourceCardId: card.id,
      });
    }
  }
}

function finishCardPlay(state: GameState, player: MatchPlayer, card: CardInstance): void {
  const face = getCardFaceByActive(card, state.activeFace);
  const eligible = computeJumpInEligible(state, card);
  if (eligible.length > 0) {
    state.jumpInWindow = {
      cardId: card.id,
      matchingFace: face,
      eligiblePlayerIds: eligible,
    };
    setTurnPhase(state, "awaitingJumpIn");
  } else {
    state.jumpInWindow = undefined;
  }
}

function completeTurn(state: GameState, additionalSkip = 0): void {
  const skipFromEffects = resolveEffects(state);
  const totalSkip = skipFromEffects + additionalSkip;
  const winners = evaluateVictory(state);
  if (winners.length > 0) {
    state.phase = "finished";
    state.winnerIds = winners;
    setTurnPhase(state, "awaitingAction");
    return;
  }
  if (state.jumpInWindow) {
    return;
  }
  setTurnPhase(state, "awaitingAction");
  advanceTurn(state, totalSkip);
  const next = currentPlayer(state);
  updateUnoFlag(next, state.ruleSet.unoCall.auto);
}

export function playCard(
  state: GameState,
  playerId: string,
  cardId: string,
  options: PlayCardOptions = {}
): void {
  ensureInGame(state);
  const player = findPlayer(state, playerId);
  const isJump = state.jumpInWindow?.eligiblePlayerIds.includes(playerId) ?? false;
  if (!isJump) {
    if (currentPlayer(state).id !== playerId) {
      throw new Error("Not your turn");
    }
    if (state.drawStack && state.ruleSet.stacking !== "off") {
      const card = player.hand.cards.find((c) => c.id === cardId);
      if (!card) {
        throw new Error("Card not found");
      }
      const face = getCardFaceByActive(card, state.activeFace);
      if (!face.drawCount) {
        throw new Error("Must resolve draw stack");
      }
    }
  }
  const card = removeCardFromHand(player, cardId);
  if (!isPlayableCard(state, player, card, options)) {
    player.hand.cards.push(card);
    throw new Error("Illegal play");
  }
  card.ownerId = undefined;
  state.discardPile.push(card);
  applyChosenColor(state, card, options.chosenColor);
  queueActionEffects(state, player, card, options);
  updateUnoFlag(player, state.ruleSet.unoCall.auto);
  finishCardPlay(state, player, card);
  if (!state.jumpInWindow) {
    completeTurn(state);
  }
}

export function finalizeJumpIn(state: GameState): void {
  if (!state.jumpInWindow) {
    return;
  }
  state.jumpInWindow = undefined;
  completeTurn(state);
}

export function drawCard(state: GameState, playerId: string): CardInstance[] {
  ensureInGame(state);
  if (currentPlayer(state).id !== playerId) {
    throw new Error("Not your turn");
  }
  const player = findPlayer(state, playerId);
  const hasPlayable = playerHasPlayableCard(state, playerId);
  if (!state.drawStack && state.ruleSet.forcePlay && hasPlayable) {
    throw new Error("Force play enabled");
  }
  const mode = state.ruleSet.drawToPlay;
  if (!state.drawStack && mode === "untilPlayable" && hasPlayable) {
    throw new Error("Must play available card before drawing");
  }
  if (state.drawStack) {
    const skip = flushDrawStack(state, playerId);
    completeTurn(state, skip);
    return [];
  }
  const drawn: CardInstance[] = [];
  const drawUntilPlayable = mode === "untilPlayable";
  let playableAvailable = hasPlayable;

  do {
    const [card] = drawFromPile(state, 1);
    card.ownerId = playerId;
    player.hand.cards.push(card);
    drawn.push(card);
    updateUnoFlag(player, state.ruleSet.unoCall.auto);
    playableAvailable = playerHasPlayableCard(state, playerId);
  } while (drawUntilPlayable && !playableAvailable);

  return drawn;
}

export function passTurn(state: GameState, playerId: string): void {
  ensureInGame(state);
  if (currentPlayer(state).id !== playerId) {
    throw new Error("Not your turn");
  }
  if (state.ruleSet.forcePlay && playerHasPlayableCard(state, playerId)) {
    throw new Error("Force play enabled");
  }
  if (state.ruleSet.drawToPlay === "untilPlayable" && playerHasPlayableCard(state, playerId)) {
    throw new Error("Must play drawn card");
  }
  completeTurn(state);
}

export function callUno(state: GameState, playerId: string): void {
  const player = findPlayer(state, playerId);
  if (player.hand.cards.length !== 1) {
    throw new Error("UNO can only be declared with one card");
  }
  player.hand.unoDeclared = true;
}

export function catchUno(state: GameState, callerId: string, targetId: string): void {
  if (callerId === targetId) {
    throw new Error("Cannot catch yourself");
  }
  const target = findPlayer(state, targetId);
  if (target.hand.cards.length === 1 && !target.hand.unoDeclared) {
    drawToPlayer(state, targetId, state.ruleSet.unoCall.penaltyDraw);
    target.hand.unoDeclared = false;
  }
}

export function attemptJumpIn(
  state: GameState,
  playerId: string,
  cardId: string,
  options: PlayCardOptions = {}
): void {
  ensureInGame(state);
  const window = state.jumpInWindow;
  if (!window) {
    throw new Error("No jump-in available");
  }
  if (!window.eligiblePlayerIds.includes(playerId)) {
    throw new Error("Player not eligible for jump-in");
  }
  const player = findPlayer(state, playerId);
  const card = removeCardFromHand(player, cardId);
  const face = getCardFaceByActive(card, state.activeFace);
  const topFace = window.matchingFace;
  const same =
    face.kind === topFace.kind &&
    face.color === topFace.color &&
    face.value === topFace.value &&
    face.action === topFace.action;
  if (!same) {
    player.hand.cards.push(card);
    throw new Error("Card does not match jump-in");
  }
  state.currentPlayerIndex = state.players.indexOf(player);
  card.ownerId = undefined;
  state.discardPile.push(card);
  applyChosenColor(state, card, options.chosenColor);
  queueActionEffects(state, player, card, options);
  updateUnoFlag(player, state.ruleSet.unoCall.auto);
  finishCardPlay(state, player, card);
  if (!state.jumpInWindow) {
    completeTurn(state);
  }
}

