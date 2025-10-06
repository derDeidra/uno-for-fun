import type { Client } from "colyseus";
import { Room } from "colyseus";
import { MatchController } from "./match";
import { defaultRuleSet } from "./rulesPreset";
import { clientMessageSchema, type ClientMessage, type ServerMessage } from "@game/protocol";

interface ClientBinding {
  client: Client;
  playerId: string;
  spectator: boolean;
  token: string;
}

export class UnoRoom extends Room {
  private match: MatchController;
  private bindings = new Map<string, ClientBinding>();

  constructor() {
    super();
    this.match = new MatchController(defaultRuleSet);
  }

  onCreate(): void {
    this.maxClients = 16;
    this.setSeatReservationTime(5);
    this.onMessage("client", (client, payload) => this.handleClientMessage(client, payload));
  }

  onLeave(client: Client, consented: boolean): void {
    const binding = this.bindings.get(client.sessionId);
    if (binding) {
      if (consented) {
        this.match.remove(binding.playerId);
      } else {
        this.match.disconnect(binding.playerId);
      }
      this.bindings.delete(client.sessionId);
      this.broadcastState();
    }
  }

  private handleClientMessage(client: Client, payload: unknown): void {
    let message: ClientMessage;
    try {
      message = clientMessageSchema.parse(payload);
    } catch (error: any) {
      this.sendError(client, "invalid_message", error.message ?? "Invalid message");
      return;
    }

    switch (message.type) {
      case "joinRoom":
        this.handleJoin(client, message);
        break;
      case "createRoom":
        this.match.setRules(message.rules ?? defaultRuleSet);
        client.send("server", {
          type: "roomCreated",
          roomCode: this.roomId,
          token: "",
        } satisfies ServerMessage);
        break;
      case "startGame":
        this.guardPlayer(client, () => {
          try {
            this.match.start();
            this.broadcastState();
          } catch (err: any) {
            this.sendError(client, "start_failed", err.message ?? "Cannot start");
          }
        });
        break;
      case "setRules":
        this.guardPlayer(client, () => {
          try {
            this.match.setRules(message.rules);
            this.broadcastState();
          } catch (err: any) {
            this.sendError(client, "rules_failed", err.message ?? "Cannot update rules");
          }
        });
        break;
      case "chat":
        this.guardPlayer(client, () => {
          const entry: ServerMessage = {
            type: "chat",
            playerId: this.bindings.get(client.sessionId)?.playerId ?? "unknown",
            message: message.message,
            timestamp: Date.now(),
          };
          this.broadcast("server", entry);
        });
        break;
      case "emote":
        this.guardPlayer(client, () => {
          const entry: ServerMessage = {
            type: "emote",
            playerId: this.bindings.get(client.sessionId)?.playerId ?? "unknown",
            emoji: message.emoji,
            timestamp: Date.now(),
          } as ServerMessage;
          this.broadcast("server", entry);
        });
        break;
      default:
        this.guardPlayer(client, (binding) => {
          if (binding.spectator) {
            this.sendError(client, "spectator", "Spectators cannot perform gameplay actions");
            return;
          }
          try {
            this.match.applyMessage(binding.playerId, message);
            this.broadcastState();
          } catch (err: any) {
            this.sendError(client, "action_failed", err.message ?? "Action failed");
          }
        });
        break;
    }
  }

  private handleJoin(client: Client, message: Extract<ClientMessage, { type: "joinRoom" }>): void {
    if (this.bindings.has(client.sessionId)) {
      this.sendError(client, "already_joined", "Client already joined");
      return;
    }
    let session = null;
    if (message.token) {
      session = this.match.resumeSession(message.token);
    }
    if (!session) {
      try {
        session = this.match.createSession(message.name, message.spectator ?? false);
      } catch (err: any) {
        this.sendError(client, "join_failed", err.message ?? "Unable to join");
        return;
      }
    }
    const binding: ClientBinding = {
      client,
      playerId: session.playerId,
      spectator: session.spectator,
      token: session.token,
    };
    this.bindings.set(client.sessionId, binding);
    client.send("server", {
      type: "joined",
      playerId: session.playerId,
      token: session.token,
    } satisfies ServerMessage);
    this.match.ensureTurnReady();
    this.sendStateTo(binding);
    this.broadcastState({ ensure: false });
  }

  private guardPlayer(client: Client, fn: (binding: ClientBinding) => void): void {
    const binding = this.bindings.get(client.sessionId);
    if (!binding) {
      this.sendError(client, "not_joined", "Join the room first");
      return;
    }
    fn(binding);
  }

  private sendStateTo(binding: ClientBinding): void {
    const view = this.match.getViewFor(binding.playerId);
    const message: ServerMessage = {
      type: "state",
      state: view.state,
      hand: view.hand,
    } as ServerMessage;
    binding.client.send("server", message);
  }

  private broadcastState(options: { ensure?: boolean } = {}): void {
    if (options.ensure !== false) {
      this.match.ensureTurnReady();
    }
    for (const binding of this.bindings.values()) {
      this.sendStateTo(binding);
    }
  }

  private sendError(client: Client, code: string, message: string): void {
    const payload: ServerMessage = {
      type: "error",
      code,
      message,
    } as ServerMessage;
    client.send("server", payload);
  }
}
