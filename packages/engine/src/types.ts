export type LightColor = "Ruby" | "Azure" | "Emerald" | "Sunshine";
export type DarkColor = "Amethyst" | "Cerulean" | "Saffron" | "Obsidian";
export type Color = LightColor | DarkColor;
export type WildColor = "Wild";

export type Value = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type ActionType =
  | "Skip"
  | "Reverse"
  | "DrawTwo"
  | "DrawFive"
  | "WildDrawFour"
  | "WildDrawFive"
  | "SwapHands"
  | "RotateHands"
  | "Flip"
  | "SkipAll";

export type Face = "light" | "dark";

export type CardFaceKind = "number" | "action" | "wild";

export interface CardFace {
  id: string;
  face: Face;
  kind: CardFaceKind;
  color: Color | WildColor;
  value?: Value;
  action?: ActionType;
  drawCount?: number;
  skipCount?: number;
  wildPlayableColors?: Color[];
}

export interface DualCard {
  id: string;
  light: CardFace;
  dark: CardFace;
}

export interface CardInstance extends DualCard {
  ownerId?: string;
}

export interface PlayerHand {
  playerId: string;
  cards: CardInstance[];
  unoDeclared: boolean;
}

export type RuleSet = {
  stacking: "off" | "sameTypeOnly" | "anyDrawStacks";
  forcePlay: boolean;
  drawToPlay: "untilPlayable" | "oneThenPass";
  jumpIn: { enabled: boolean; allowOnWildResolution: boolean };
  sevenZero: boolean;
  unoCall: { required: boolean; auto: boolean; penaltyDraw: number };
  variant: "base" | "unoFlip";
};

export type TurnDirection = 1 | -1;

export interface EffectDraw {
  type: "draw";
  targetPlayerId: string;
  amount: number;
  sourceCardId: string;
}

export interface EffectSkip {
  type: "skip";
  targetCount: number;
  sourceCardId: string;
}

export interface EffectReverse {
  type: "reverse";
  sourceCardId: string;
}

export interface EffectFlip {
  type: "flip";
  sourceCardId: string;
}

export interface EffectSwapHands {
  type: "swapHands";
  sourcePlayerId: string;
  targetPlayerId: string;
  sourceCardId: string;
}

export interface EffectRotateHands {
  type: "rotateHands";
  direction: TurnDirection;
  sourceCardId: string;
}

export type PendingEffect =
  | EffectDraw
  | EffectSkip
  | EffectReverse
  | EffectFlip
  | EffectSwapHands
  | EffectRotateHands;

export type TurnPhase =
  | "awaitingAction"
  | "resolvingEffects"
  | "awaitingJumpIn"
  | "awaitingUnoCall";

export type MatchPhase = "lobby" | "inGame" | "finished";

export interface MatchPlayer {
  id: string;
  name: string;
  connected: boolean;
  hand: PlayerHand;
  isSpectator?: boolean;
}

export interface SeedState {
  seed: string;
  counter: number;
}

export interface GameState {
  id: string;
  createdAt: number;
  updatedAt: number;
  phase: MatchPhase;
  turnPhase: TurnPhase;
  activeFace: Face;
  currentColor: Color | WildColor;
  players: MatchPlayer[];
  currentPlayerIndex: number;
  direction: TurnDirection;
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  pendingEffects: PendingEffect[];
  ruleSet: RuleSet;
  rng: SeedState;
  winnerIds: string[];
  jumpInWindow?: {
    cardId: string;
    matchingFace: CardFace;
    eligiblePlayerIds: string[];
  };
  drawStack?: {
    amount: number;
    sourceCardId: string;
    lastAction: ActionType | null;
  };
}

export interface PlayCardOptions {
  chosenColor?: Color;
  targetPlayerId?: string;
}

export interface SerializableState {
  id: string;
  phase: MatchPhase;
  turnPhase: TurnPhase;
  activeFace: Face;
  currentColor: Color | WildColor;
  currentPlayerIndex: number;
  direction: TurnDirection;
  ruleSet: RuleSet;
  players: Array<{
    id: string;
    name: string;
    connected: boolean;
    cardCount: number;
    unoDeclared: boolean;
    isSpectator?: boolean;
    handPreview?: Array<{
      id: string;
      face: CardFace;
    }>;
  }>;
  topDiscard?: CardFace;
  drawPileCount: number;
  pendingEffects: PendingEffect[];
  winnerIds: string[];
}
