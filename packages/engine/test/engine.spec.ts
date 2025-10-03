import { describe, it, expect } from 'vitest';
import {
  createGameState,
  playCard,
  drawFromDeck,
  attemptJumpIn,
  catchUno,
  RuleSet,
  getPlayableCards,
  applyFlip
} from '../src';
import { getFace } from '../src';

const baseRules: RuleSet = {
  stacking: 'anyDrawStacks',
  forcePlay: false,
  drawToPlay: 'oneThenPass',
  jumpIn: { enabled: true, allowOnWildResolution: false },
  sevenZero: true,
  unoCall: { required: true, auto: false, penaltyDraw: 2 },
  variant: 'base'
};

const createState = (overrides: Partial<RuleSet> = {}) =>
  createGameState({
    players: [
      { id: 'A', name: 'Alice' },
      { id: 'B', name: 'Bob' },
      { id: 'C', name: 'Cara' }
    ],
    ruleSet: { ...baseRules, ...overrides },
    seed: 'test-seed'
  });

const findCard = (state: ReturnType<typeof createState>, predicate: (face: ReturnType<typeof getFace>) => boolean, exclude: string[] = []) => {
  for (const id of Object.keys(state.cards)) {
    if (exclude.includes(id)) continue;
    const face = getFace(state.cards[id], state.activeSide);
    if (predicate(face)) {
      return id;
    }
  }
  throw new Error('Card not found');
};

const removeCard = (state: ReturnType<typeof createState>, cardId: string) => {
  state.drawPile = state.drawPile.filter((id) => id !== cardId);
  state.discardPile = state.discardPile.filter((id) => id !== cardId);
  state.players.forEach((player) => {
    player.hand = player.hand.filter((id) => id !== cardId);
  });
};

describe('engine rules', () => {
  it('matches cards by color or value', () => {
    const state = createState();
    const redFive = findCard(state, (face) => face.kind === 'number' && face.color === 'red' && face.value === 5);
    const blueFive = findCard(state, (face) => face.kind === 'number' && face.color === 'blue' && face.value === 5);
    const redSkip = findCard(state, (face) => face.kind === 'action' && face.color === 'red' && face.action === 'skip');

    removeCard(state, redFive);
    removeCard(state, blueFive);
    removeCard(state, redSkip);

    state.discardPile = [redFive];
    state.players[0].hand = [blueFive, redSkip];

    const playable = getPlayableCards(state, state.players[0]);
    expect(playable).toContain(blueFive);
    expect(playable).toContain(redSkip);
  });

  it('supports draw stacking accumulation', () => {
    const state = createState();
    const drawTwoA = findCard(state, (face) => face.kind === 'action' && face.action === 'drawTwo');
    const drawTwoB = findCard(state, (face) => face.kind === 'action' && face.action === 'drawTwo', [drawTwoA]);
    const fillerCard = findCard(state, (face) => face.kind === 'number', [drawTwoA, drawTwoB]);

    removeCard(state, drawTwoA);
    removeCard(state, drawTwoB);
    removeCard(state, fillerCard);
    state.discardPile = [drawTwoA];
    state.pendingDraw = {
      count: 2,
      sources: [drawTwoA],
      type: 'drawTwo',
      target: 'A'
    };
    state.currentPlayerIndex = state.players.findIndex((p) => p.id === 'A');
    state.players[0].hand = [drawTwoB, fillerCard];

    const next = playCard(state, 'A', drawTwoB);
    expect(next.pendingDraw).not.toBeNull();
    expect(next.pendingDraw?.count).toBe(4);
    expect(next.pendingDraw?.sources).toEqual([drawTwoA, drawTwoB]);
    expect(next.pendingDraw?.target).toBe('B');
  });

  it('handles jump-in interrupt', () => {
    const state = createState();
    const sharedCard = findCard(state, (face) => face.kind === 'number' && face.value === 3 && face.color === 'green');
    const duplicate = findCard(state, (face) => face.kind === 'number' && face.value === 3 && face.color === 'green', [sharedCard]);
    removeCard(state, sharedCard);
    removeCard(state, duplicate);
    state.discardPile = [sharedCard];
    state.players[1].hand = [duplicate];
    const after = attemptJumpIn(state, 'B', duplicate);
    expect(after.discardPile[after.discardPile.length - 1]).toBe(duplicate);
    expect(after.players[1].hand).toHaveLength(0);
  });

  it('applies seven hand swap', () => {
    const state = createState();
    const seven = findCard(state, (face) => face.kind === 'number' && face.value === 7);
    removeCard(state, seven);
    const filler = findCard(state, (face) => face.kind === 'number', [seven]);
    removeCard(state, filler);
    const alt = findCard(state, (face) => face.kind === 'number', [seven, filler]);
    removeCard(state, alt);
    state.players[0].hand = [seven];
    state.players[1].hand = [alt];
    state.discardPile = [filler];
    const after = playCard(state, 'A', seven, { targetId: 'B' });
    expect(after.players[0].hand).toEqual([alt]);
    expect(after.players[1].hand).toEqual([]);
  });

  it('rotates hands on zero', () => {
    const state = createState();
    const zero = findCard(state, (face) => face.kind === 'number' && face.value === 0);
    removeCard(state, zero);
    const filler = findCard(state, (face) => face.kind === 'number' && face.value !== 0, [zero]);
    removeCard(state, filler);
    const bCard = findCard(state, (face) => face.kind === 'number', [zero, filler]);
    const cCard = findCard(state, (face) => face.kind === 'number', [zero, filler, bCard]);
    removeCard(state, bCard);
    removeCard(state, cCard);
    state.discardPile = [filler];
    state.players[0].hand = [zero];
    state.players[1].hand = [bCard];
    state.players[2].hand = [cCard];
    const after = playCard(state, 'A', zero);
    expect(after.players[0].hand).toEqual([cCard]);
    expect(after.players[1].hand).toEqual([]);
    expect(after.players[2].hand).toEqual([bCard]);
  });

  it('tracks UNO declaration and penalties', () => {
    const state = createState();
    const top = findCard(state, (face) => face.kind === 'number' && face.value !== 9);
    removeCard(state, top);
    const topFace = getFace(state.cards[top], state.activeSide);
    const card = findCard(
      state,
      (face) => face.kind === 'number' && face.color === topFace.color && face.value !== topFace.value,
      [top]
    );
    const keeper = findCard(
      state,
      (face) => face.kind === 'number' && face.color === topFace.color && face.value !== topFace.value,
      [top, card]
    );
    removeCard(state, card);
    removeCard(state, keeper);
    state.discardPile = [top];
    state.players[0].hand = [card, keeper];
    state.currentColor = topFace.color;
    let next = playCard(state, 'A', card, { declareUno: false });
    expect(next.pendingUno.find((entry) => entry.playerId === 'A')).toBeTruthy();
    next = catchUno(next, 'B', 'A').state;
    expect(next.players.find((p) => p.id === 'A')?.hand.length).toBeGreaterThan(0);
  });

  it('drawn cards remain with player until they play (draw to play)', () => {
    const state = createState({ drawToPlay: 'untilPlayable' });
    const card = findCard(state, (face) => face.kind === 'number');
    removeCard(state, card);
    state.players[0].hand = [];
    const result = drawFromDeck(state, 'A', 1);
    const after = result.state;
    expect(after.players[0].hand.length).toBe(1);
    expect(after.currentPlayerIndex).toBe(state.currentPlayerIndex);
  });

  it('flip keeps deck integrity', () => {
    const state = createState({ variant: 'unoFlip' });
    const beforeCount = state.drawPile.length + state.discardPile.length;
    const flipped = applyFlip(state);
    const afterCount = flipped.drawPile.length + flipped.discardPile.length;
    expect(afterCount).toBe(beforeCount);
    expect(flipped.activeSide).toBe('dark');
  });
});
