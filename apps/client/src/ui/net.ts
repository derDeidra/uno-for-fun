import { Client, Room } from "colyseus.js";
import { clientMessageSchema, serverMessageSchema, type ClientMessage, type ServerMessage } from "@game/protocol";

export type NetworkEvent = ServerMessage["type"];
export type NetworkHandler<T extends NetworkEvent> = (message: Extract<ServerMessage, { type: T }>) => void;

function defaultEndpoint(): string {
  const override = (globalThis as any).UNO_SERVER_URL ?? (import.meta as any)?.env?.VITE_SERVER_URL;
  if (override && typeof override === "string") {
    return override;
  }
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const host = location.hostname || "localhost";
  const port = 2567;
  return `${protocol}://${host}:${port}`;
}

export class NetworkClient {
  private client: Client;
  private room?: Room;
  private handlers: Map<NetworkEvent, Set<NetworkHandler<NetworkEvent>>> = new Map();

  constructor(endpoint = defaultEndpoint()) {
    this.client = new Client(endpoint);
  }

  async connect(room = "uno"): Promise<void> {
    if (this.room) {
      return;
    }
    this.room = await this.client.joinOrCreate(room);
    this.room.onMessage("server", (message: unknown) => this.handleMessage(message));
  }

  async join(payload: Extract<ClientMessage, { type: "joinRoom" }>): Promise<void> {
    await this.send(payload);
  }

  async send(message: ClientMessage): Promise<void> {
    clientMessageSchema.parse(message);
    if (!this.room) {
      throw new Error("Room not connected");
    }
    this.room.send("client", message);
  }

  on<T extends NetworkEvent>(event: T, handler: NetworkHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(handler as NetworkHandler<NetworkEvent>);
  }

  off<T extends NetworkEvent>(event: T, handler: NetworkHandler<T>): void {
    this.handlers.get(event)?.delete(handler as NetworkHandler<NetworkEvent>);
  }

  private handleMessage(raw: unknown): void {
    let message: ServerMessage;
    try {
      message = serverMessageSchema.parse(raw);
    } catch (err) {
      console.error("Failed to parse server message", raw, err);
      return;
    }
    const listeners = this.handlers.get(message.type);
    listeners?.forEach((handler) => handler(message as any));
  }
}
