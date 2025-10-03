import { RuleSet, Color } from "@game/engine";

export type ClientMessage =
  | { type: "createRoom"; preferredCode?: string; rules?: RuleSet }
  | { type: "joinRoom"; roomCode: string; name: string; spectator?: boolean; token?: string }
  | { type: "leaveRoom" }
  | { type: "startGame" }
  | { type: "playCard"; cardId: string; chosenColor?: Color; targetPlayerId?: string }
  | { type: "drawCard" }
  | { type: "pass" }
  | { type: "callUno" }
  | { type: "catchUno"; targetPlayerId: string }
  | { type: "jumpIn"; cardId: string; chosenColor?: Color }
  | { type: "finalizeJump" }
  | { type: "setRules"; rules: RuleSet }
  | { type: "chat"; message: string }
  | { type: "emote"; emoji: string };

export type ServerMessage =
  | { type: "roomCreated"; roomCode: string; token: string }
  | { type: "joined"; playerId: string; token: string }
  | { type: "state"; state: unknown; hand?: unknown }
  | { type: "chat"; playerId: string; message: string; timestamp: number }
  | { type: "emote"; playerId: string; emoji: string; timestamp: number }
  | { type: "error"; code: string; message: string };

export interface SessionResumePayload {
  roomCode: string;
  token: string;
}

export interface PresenceHeartbeat {
  type: "heartbeat";
  time: number;
}

export type ReliableServerMessage = Exclude<ServerMessage, { type: "chat" } | { type: "emote" }>;
