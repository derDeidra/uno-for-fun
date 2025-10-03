import express from "express";
import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { UnoRoom } from "./room";

export function createColyseusApp() {
  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  const httpServer = createServer(app);
  const transport = new WebSocketTransport({ server: httpServer });
  const gameServer = new Server({ transport });
  gameServer.define("uno", UnoRoom);
  return { app, httpServer, gameServer };
}
