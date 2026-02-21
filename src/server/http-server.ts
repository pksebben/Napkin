import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import type { ClientMessage, ServerMessage } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface HttpServerOptions {
  port?: number;
  onPushDesign: (elements: unknown, appState: unknown, selectedElementIds: string[]) => void;
}

export interface HttpServerInstance {
  url: string;
  broadcast: (msg: ServerMessage) => void;
  close: () => Promise<void>;
}

export async function startHttpServer(options: HttpServerOptions): Promise<HttpServerInstance> {
  const port = options.port ?? 3210;
  const app = express();

  // Serve the built Vite client from dist/client
  const clientDir = path.resolve(__dirname, "../client");
  app.use(express.static(clientDir));
  // SPA fallback
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("message", (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        if (msg.type === "push_design") {
          options.onPushDesign(msg.elements, msg.appState, msg.selectedElementIds);
        }
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    });
  });

  function broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });

  const url = `http://localhost:${port}`;
  console.error(`Napkin server listening at ${url}`);

  return {
    url,
    broadcast,
    close: () => new Promise<void>((resolve) => {
      wss.close();
      httpServer.close(() => resolve());
    }),
  };
}
