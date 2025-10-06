import { CardInstance, GameState, SerializableState } from "./types";
import { getCardFaceByActive } from "./card";

export function serializeState(state: GameState): SerializableState {
  const top = state.discardPile[state.discardPile.length - 1];
  const revealOpposite = state.ruleSet.variant === "unoFlip";
  const previewFace = revealOpposite
    ? (state.activeFace === "light" ? "dark" : "light")
    : state.activeFace;
  return {
    id: state.id,
    phase: state.phase,
    turnPhase: state.turnPhase,
    activeFace: state.activeFace,
    currentColor: state.currentColor,
    currentPlayerIndex: state.currentPlayerIndex,
    direction: state.direction,
    ruleSet: state.ruleSet,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      cardCount: player.hand.cards.length,
      unoDeclared: player.hand.unoDeclared,
      isSpectator: player.isSpectator,
      handPreview: revealOpposite
        ? player.hand.cards.map((card) => ({
            id: card.id,
            face: getCardFaceByActive(card, previewFace),
          }))
        : undefined,
    })),
    topDiscard: top ? getCardFaceByActive(top, state.activeFace) : undefined,
    drawPileCount: state.drawPile.length,
    pendingEffects: [...state.pendingEffects],
    winnerIds: [...state.winnerIds],
  };
}

export function serializeHand(hand: CardInstance[]): Array<{
  id: string;
  light: CardInstance["light"];
  dark: CardInstance["dark"];
}> {
  return hand.map((card) => ({
    id: card.id,
    light: card.light,
    dark: card.dark,
  }));
}

export function getPlayerHand(state: GameState, playerId: string): CardInstance[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }
  return player.hand.cards;
}
