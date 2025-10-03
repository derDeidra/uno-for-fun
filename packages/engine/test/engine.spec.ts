import { describe, expect, test } from "vitest";
import {
  RuleSet,
  createGameState,
  playCard,
  drawCard,
  passTurn,
  catchUno,
  attemptJumpIn,
  finalizeJumpIn,
  GameState,
  CardInstance,
  ActionType,
  Value,
} from "@game/engine";

const baseRules: RuleSet = {
  stacking: "sameTypeOnly",
  forcePlay: false,
  drawToPlay: "oneThenPass",
  jumpIn: { enabled: true, allowOnWildResolution: false },
  sevenZero: true,
  unoCall: { required: true, auto: false, penaltyDraw: 2 },
  variant: "base",
};

function makeNumberCard(color: "Ruby" | "Azure" | "Emerald" | "Sunshine", value: Value): CardInstance {
  return {
    id: `${color}-${value}-${Math.random()}`,
    light: {
      id: `${color}-${value}-light-${Math.random()}`,
      face: "light",
      kind: "number",
      color,
      value,
    },
    dark: {
      id: `${color}-${value}-dark-${Math.random()}`,
      face: "dark",
      kind: "number",
      color,
      value,
    },
  };
}

function makeActionCard(
  color: "Ruby" | "Azure" | "Emerald" | "Sunshine",
  action: ActionType,
  drawCount?: number
): CardInstance {
  return {
    id: `${color}-${action}-${Math.random()}`,
    light: {
      id: `${color}-${action}-light-${Math.random()}`,
      face: "light",
      kind: drawCount ? "wild" : "action",
      color,
      action,
      drawCount,
    },
    dark: {
      id: `${color}-${action}-dark-${Math.random()}`,
      face: "dark",
      kind: drawCount ? "wild" : "action",
      color,
      action,
      drawCount,
    },
  };
}

function makeWildCard(action?: ActionType, drawCount?: number): CardInstance {
  return {
    id: `wild-${action ?? "plain"}-${Math.random()}`,
    light: {
      id: `wild-${action ?? "plain"}-light-${Math.random()}`,
      face: "light",
      kind: "wild",
      color: "Wild",
      action,
      drawCount,
      wildPlayableColors: ["Ruby", "Azure", "Emerald", "Sunshine"],
    },
    dark: {
      id: `wild-${action ?? "plain"}-dark-${Math.random()}`,
      face: "dark",
      kind: "wild",
      color: "Wild",
      action,
      drawCount,
      wildPlayableColors: ["Amethyst", "Cerulean", "Saffron", "Obsidian"],
    },
  };
}

function createTestState(overrides: Partial<RuleSet> = {}): GameState {
  const state = createGameState({ ...baseRules, ...overrides }, "test-seed");
  state.phase = "inGame";
  state.turnPhase = "awaitingAction";
  state.players = [
    {
      id: "p1",
      name: "P1",
      connected: true,
      isSpectator: false,
      hand: { playerId: "p1", cards: [], unoDeclared: false },
    },
    {
      id: "p2",
      name: "P2",
      connected: true,
      isSpectator: false,
      hand: { playerId: "p2", cards: [], unoDeclared: false },
    },
    {
      id: "p3",
      name: "P3",
      connected: true,
      isSpectator: false,
      hand: { playerId: "p3", cards: [], unoDeclared: false },
    },
  ];
  state.currentPlayerIndex = 0;
  state.drawPile = [];
  state.discardPile = [];
  state.currentColor = "Ruby";
  return state;
}

describe("engine rules", () => {
  test("legal move matching on color and value", () => {
    const state = createTestState();
    const top = makeNumberCard("Ruby", 3);
    state.discardPile.push(top);
    const playColor = makeNumberCard("Ruby", 5);
    const playValue = makeNumberCard("Azure", 3);
    state.players[0].hand.cards.push(playColor, playValue);

    expect(() => playCard(state, "p1", playColor.id)).not.toThrow();
    expect(state.discardPile[state.discardPile.length - 1].id).toBe(playColor.id);
    state.currentPlayerIndex = 0;
    state.jumpInWindow = undefined;
    state.players[0].hand.cards.push(playValue);
    state.discardPile = [top];
    expect(() => playCard(state, "p1", playValue.id)).not.toThrow();
  });

  test("draw-to-play modes", () => {
    const onceState = createTestState({ drawToPlay: "oneThenPass" });
    const top = makeNumberCard("Ruby", 6);
    onceState.discardPile.push(top);
    onceState.currentColor = "Ruby";
    const drawnCard = makeNumberCard("Emerald", 9);
    onceState.drawPile.push(drawnCard);
    const drawn = drawCard(onceState, "p1");
    expect(drawn).toHaveLength(1);
    expect(onceState.players[0].hand.cards).toContain(drawnCard);

    const untilState = createTestState({ drawToPlay: "untilPlayable" });
    untilState.discardPile.push(top);
    untilState.currentColor = "Ruby";
    const first = makeNumberCard("Emerald", 1);
    const second = makeNumberCard("Ruby", 7);
    untilState.drawPile.push(second, first);
    const drawnSeq = drawCard(untilState, "p1");
    expect(drawnSeq).toHaveLength(2);
    expect(untilState.players[0].hand.cards).toContain(second);
    expect(untilState.players[0].hand.cards).toContain(first);
  });

  test("stacking accumulation and forced draw", () => {
    const state = createTestState({ stacking: "sameTypeOnly" });
    const top = makeNumberCard("Ruby", 2);
    state.discardPile.push(top);
    state.currentColor = "Ruby";
    const drawTwoA = makeActionCard("Ruby", "DrawTwo", 2);
    const drawTwoB = makeActionCard("Azure", "DrawTwo", 2);
    state.players[0].hand.cards.push(drawTwoA);
    state.players[1].hand.cards.push(drawTwoB);
    state.players[2].hand.cards = [];
    playCard(state, "p1", drawTwoA.id);
    expect(state.drawStack?.amount).toBe(2);
    expect(state.currentPlayerIndex).toBe(1);
    playCard(state, "p2", drawTwoB.id);
    expect(state.drawStack?.amount).toBe(4);
    expect(state.currentPlayerIndex).toBe(2);
    const before = state.players[2].hand.cards.length;
    drawCard(state, "p3");
    expect(state.players[2].hand.cards.length).toBe(before + 4);
    expect(state.drawStack).toBeUndefined();
  });

  test("jump-in allows matching player to take turn", () => {
    const state = createTestState({ jumpIn: { enabled: true, allowOnWildResolution: true } });
    const top = makeNumberCard("Ruby", 8);
    state.discardPile.push(top);
    const card = makeNumberCard("Azure", 5);
    state.players[0].hand.cards.push(card);
    const matching = makeNumberCard("Azure", 5);
    matching.ownerId = "p3";
    state.players[2].hand.cards.push(matching);
    playCard(state, "p1", card.id);
    expect(state.jumpInWindow).toBeDefined();
    attemptJumpIn(state, "p3", matching.id);
    expect(state.discardPile[state.discardPile.length - 1].id).toBe(matching.id);
    finalizeJumpIn(state);
    expect(state.jumpInWindow).toBeUndefined();
  });

  test("seven swaps hands and zero rotates", () => {
    const state = createTestState({ sevenZero: true });
    const top = makeNumberCard("Ruby", 4);
    state.discardPile.push(top);
    state.players[0].hand.cards.push(makeNumberCard("Azure", 1));
    const seven = makeNumberCard("Ruby", 7);
    state.players[0].hand.cards.push(seven);
    state.players[1].hand.cards.push(makeNumberCard("Emerald", 9));
    state.players[1].hand.cards.push(makeNumberCard("Ruby", 5));
    playCard(state, "p1", seven.id, { targetPlayerId: "p2" });
    expect(state.players[0].hand.cards.length).toBe(2);
    expect(state.players[1].hand.cards.length).toBe(1);

    const zero = makeNumberCard("Ruby", 0);
    state.players[0].hand.cards.push(zero);
    playCard(state, "p1", zero.id);
    expect(state.players[0].hand.cards.length).toBe(1);
    expect(state.players[1].hand.cards.length).toBeGreaterThan(0);
  });

  test("UNO call penalty applies when not declared", () => {
    const state = createTestState();
    const top = makeNumberCard("Ruby", 9);
    state.discardPile.push(top);
    state.players[1].hand.cards = [makeNumberCard("Azure", 2)];
    state.players[1].hand.unoDeclared = false;
    const before = state.players[1].hand.cards.length;
    catchUno(state, "p1", "p2");
    expect(state.players[1].hand.cards.length).toBe(before + state.ruleSet.unoCall.penaltyDraw);
  });

  test("UNO Flip flip maintains deck integrity", () => {
    const state = createTestState({ variant: "unoFlip" });
    const flipCard: CardInstance = {
      id: "flip-lite",
      light: {
        id: "flip-light",
        face: "light",
        kind: "action",
        color: "Ruby",
        action: "Flip",
      },
      dark: {
        id: "flip-dark",
        face: "dark",
        kind: "action",
        color: "Amethyst",
        action: "Flip",
      },
    };
    const other = makeNumberCard("Ruby", 5);
    state.discardPile.push(other);
    state.players[0].hand.cards.push(flipCard);
    const totalBefore = state.discardPile.length + state.drawPile.length + state.players.reduce(
      (sum, player) => sum + player.hand.cards.length,
      0
    );
    playCard(state, "p1", flipCard.id);
    finalizeJumpIn(state);
    const totalAfter = state.discardPile.length + state.drawPile.length + state.players.reduce(
      (sum, player) => sum + player.hand.cards.length,
      0
    );
    expect(state.activeFace).toBe("dark");
    expect(state.currentColor).toBe("Amethyst");
    expect(totalAfter).toBe(totalBefore);
  });
});
