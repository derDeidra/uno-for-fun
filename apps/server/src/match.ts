import {
  RuleSet,
  GameState,
  createGameState,
  addPlayer,
  setPlayerConnection,
  removePlayer,
  startGame,
  updateRuleSet,
  playCard,
  drawCard,
  passTurn,
  callUno,
  catchUno,
  attemptJumpIn,
  finalizeJumpIn,
  serializeState,
  serializeHand,
  getPlayerHand,
  currentPlayer,
  playerHasPlayableCard,
} from "@game/engine";
import { clientMessageSchema } from "@game/protocol";
import type { ClientMessage } from "@game/protocol";

interface SessionData {
  playerId: string;
  name: string;
  spectator: boolean;
  token: string;
}

export interface StateView {
  state: ReturnType<typeof serializeState>;
  hand: ReturnType<typeof serializeHand> | null;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MatchController {
  public state: GameState;
  private sessions = new Map<string, SessionData>();
  private tokens = new Map<string, SessionData>();

  constructor(ruleSet: RuleSet, seed?: string) {
    this.state = createGameState(ruleSet, seed);
  }

  get ruleSet(): RuleSet {
    return this.state.ruleSet;
  }

  setRules(rules: RuleSet): void {
    updateRuleSet(this.state, rules);
  }

  createSession(name: string, spectator = false): SessionData {
    const playerId = randomId("player");
    const token = randomId("token");
    addPlayer(this.state, playerId, name, spectator);
    const session: SessionData = { playerId, name, spectator, token };
    this.sessions.set(playerId, session);
    this.tokens.set(token, session);
    return session;
  }

  resumeSession(token: string): SessionData | null {
    const session = this.tokens.get(token) ?? null;
    if (!session) {
      return null;
    }
    setPlayerConnection(this.state, session.playerId, true);
    return session;
  }

  disconnect(playerId: string): void {
    setPlayerConnection(this.state, playerId, false);
  }

  remove(playerId: string): void {
    this.sessions.delete(playerId);
    const tokenEntry = [...this.tokens.entries()].find(([, session]) => session.playerId === playerId);
    if (tokenEntry) {
      this.tokens.delete(tokenEntry[0]);
    }
    removePlayer(this.state, playerId);
    this.ensureTurnReady();
  }

  start(): void {
    startGame(this.state);
    this.ensureTurnReady();
  }

  applyMessage(playerId: string, message: ClientMessage): void {
    switch (message.type) {
      case "playCard":
        playCard(this.state, playerId, message.cardId, {
          chosenColor: message.chosenColor,
          targetPlayerId: message.targetPlayerId,
        });
        break;
      case "drawCard":
        drawCard(this.state, playerId);
        break;
      case "pass":
        passTurn(this.state, playerId);
        break;
      case "callUno":
        callUno(this.state, playerId);
        break;
      case "catchUno":
        catchUno(this.state, playerId, message.targetPlayerId);
        break;
      case "jumpIn":
        attemptJumpIn(this.state, playerId, message.cardId, { chosenColor: message.chosenColor });
        break;
      case "finalizeJump":
        finalizeJumpIn(this.state);
        break;
      case "setRules":
        this.setRules(message.rules);
        break;
      default:
        break;
    }
    this.ensureTurnReady();
  }

  ensureTurnReady(): void {
    if (this.state.phase !== "inGame") {
      return;
    }
    let iterations = 0;
    while (iterations++ < 24) {
      if (this.state.phase !== "inGame") {
        break;
      }
      if (this.state.jumpInWindow) {
        break;
      }
      const active = currentPlayer(this.state);
      if (!active || active.isSpectator) {
        break;
      }
      if (this.state.drawStack) {
        drawCard(this.state, active.id);
        continue;
      }
      if (!playerHasPlayableCard(this.state, active.id)) {
        drawCard(this.state, active.id);
        if (this.state.phase !== "inGame") {
          break;
        }
        if (this.state.jumpInWindow) {
          break;
        }
        if (this.state.ruleSet.drawToPlay === "oneThenPass" && !playerHasPlayableCard(this.state, active.id)) {
          passTurn(this.state, active.id);
          continue;
        }
        continue;
      }
      break;
    }
  }

  getViewFor(playerId: string): StateView {
    const serial = serializeState(this.state);
    let hand = null;
    try {
      const cards = getPlayerHand(this.state, playerId);
      hand = serializeHand(cards);
    } catch (_err) {
      hand = null;
    }
    return { state: serial, hand };
  }

  validateClientMessage(message: unknown): ClientMessage {
    return clientMessageSchema.parse(message);
  }
}
