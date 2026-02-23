import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import type { ClientMessage, ServerMessage } from "../shared/types.js";
import { StateStore } from "./state.js";
import type { SessionPersistence } from "./persistence.js";
import { dehydrate } from "./dehydrator.js";
import { validateMermaid } from "./validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

declare const __IS_BUNDLE__: boolean;

interface SessionEntry {
  store: StateStore;
  clients: Set<WebSocket>;
  createdAt: Date;
}

export interface SharedServerInstance {
  url: string;
  port: number;
  close: () => Promise<void>;
}

function generateName(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `napkin-${suffix}`;
}

function broadcast(entry: SessionEntry, msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of entry.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

async function persistSession(
  persistence: SessionPersistence,
  name: string,
  entry: SessionEntry,
): Promise<void> {
  const store = entry.store;
  await persistence.save(name, {
    version: 1,
    name,
    createdAt: entry.createdAt.toISOString(),
    currentDesign: store.getCurrentDesign(),
    nodeCount: store.getNodeCount(),
    edgeCount: store.getEdgeCount(),
    selectedElements: store.getSelectedElements(),
    history: store.getHistory(Infinity),
  });
}

export async function startSharedServer(
  port: number = 0,
  persistence?: SessionPersistence,
): Promise<SharedServerInstance> {
  const app = express();
  const sessions = new Map<string, SessionEntry>();

  app.use(express.json());

  // --- API: list sessions ---
  app.get("/api/sessions", (_req, res) => {
    const list = Array.from(sessions.entries()).map(([name, entry]) => ({
      name,
      createdAt: entry.createdAt.toISOString(),
      snapshotCount: entry.store.getSnapshotCount(),
    }));
    res.json(list);
  });

  // --- API: create session ---
  app.post("/api/sessions", async (req, res) => {
    const requestedName = req.body?.name as string | undefined;
    const sessionName = requestedName || generateName();

    // Idempotent: return existing
    const existing = sessions.get(sessionName);
    if (existing) {
      res.json({
        name: sessionName,
        createdAt: existing.createdAt.toISOString(),
        snapshotCount: existing.store.getSnapshotCount(),
      });
      return;
    }

    const store = new StateStore();
    const createdAt = new Date();

    // Restore persisted state if available
    if (persistence) {
      try {
        const persisted = await persistence.load(sessionName);
        if (persisted) {
          store.restore(
            persisted.currentDesign,
            persisted.history,
            persisted.nodeCount,
            persisted.edgeCount,
            persisted.selectedElements,
          );
          console.error(`[${sessionName}] Restored ${persisted.history.length} snapshots from disk`);
        }
      } catch (err) {
        console.error(`[${sessionName}] Failed to load persisted session:`, err);
      }
    }

    const entry: SessionEntry = { store, clients: new Set(), createdAt };
    sessions.set(sessionName, entry);

    res.status(201).json({
      name: sessionName,
      createdAt: createdAt.toISOString(),
      snapshotCount: store.getSnapshotCount(),
    });
  });

  // --- API: destroy session ---
  app.delete("/api/sessions/:name", (req, res) => {
    const entry = sessions.get(req.params.name);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    for (const client of entry.clients) {
      client.close();
    }
    sessions.delete(req.params.name);
    res.json({ success: true });
  });

  // --- API: read design ---
  app.get("/api/sessions/:name/design", (req, res) => {
    const entry = sessions.get(req.params.name);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const store = entry.store;
    res.json({
      mermaid: store.getCurrentDesign(),
      selectedElements: store.getSelectedElements(),
      nodeCount: store.getNodeCount(),
      edgeCount: store.getEdgeCount(),
    });
  });

  // --- API: write design ---
  app.post("/api/sessions/:name/design", async (req, res) => {
    const entry = sessions.get(req.params.name);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const { mermaid } = req.body;
    if (!mermaid || typeof mermaid !== "string") {
      res.status(400).json({ success: false, errors: ["Missing or invalid mermaid"] });
      return;
    }

    const validation = await validateMermaid(mermaid);
    if (!validation.valid) {
      res.status(400).json({ success: false, errors: validation.errors });
      return;
    }

    entry.store.setDesign(mermaid, "claude");
    broadcast(entry, { type: "design_update", mermaid });
    broadcast(entry, { type: "history_changed" });

    if (persistence) {
      persistSession(persistence, req.params.name, entry).catch((err) =>
        console.error(`[${req.params.name}] Persist failed:`, err),
      );
    }

    res.json({ success: true });
  });

  // --- API: get history ---
  app.get("/api/sessions/:name/history", (req, res) => {
    const entry = sessions.get(req.params.name);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const history = entry.store.getHistory(limit);
    res.json({ history });
  });

  // --- API: rollback ---
  app.post("/api/sessions/:name/rollback", (req, res) => {
    const entry = sessions.get(req.params.name);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const { timestamp } = req.body;
    if (!timestamp || typeof timestamp !== "string") {
      res.status(400).json({ error: "Missing or invalid timestamp" });
      return;
    }
    try {
      entry.store.rollback(timestamp);
      const mermaid = entry.store.getCurrentDesign();
      if (mermaid) {
        broadcast(entry, { type: "design_update", mermaid });
      }
      broadcast(entry, { type: "history_changed" });

      if (persistence) {
        persistSession(persistence, req.params.name, entry).catch((err) =>
          console.error(`[${req.params.name}] Persist failed:`, err),
        );
      }

      res.json({ success: true, mermaid });
    } catch (err: unknown) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // --- API: delete snapshot ---
  app.delete("/api/sessions/:name/history/:timestamp", (req, res) => {
    const entry = sessions.get(req.params.name);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    try {
      entry.store.deleteSnapshot(req.params.timestamp);
      broadcast(entry, { type: "history_changed" });

      if (persistence) {
        persistSession(persistence, req.params.name, entry).catch((err) =>
          console.error(`[${req.params.name}] Persist failed:`, err),
        );
      }

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // Serve the built Vite client
  const clientDir = (typeof __IS_BUNDLE__ !== "undefined" && __IS_BUNDLE__)
    ? path.join(__dirname, "client")
    : path.resolve(__dirname, "../../dist/client");
  app.use(express.static(clientDir));

  // SPA fallback — serve index.html for /s/{name}/* paths
  // Use { root } option so Express doesn't reject dotfile directories (e.g. ~/.local)
  app.get("/s/{*splat}", (_req, res) => {
    res.sendFile("index.html", { root: clientDir });
  });
  // Also handle root
  app.get("/", (_req, res) => {
    res.sendFile("index.html", { root: clientDir });
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // WebSocket upgrade: route /s/{name}/ws to the right session
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/s\/([^/]+)\/ws$/);
    if (!match) {
      socket.destroy();
      return;
    }

    const sessionName = match[1];
    const entry = sessions.get(sessionName);
    if (!entry) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      entry.clients.add(ws);
      ws.on("close", () => entry.clients.delete(ws));
      ws.on("message", (data) => {
        try {
          const msg: ClientMessage = JSON.parse(data.toString());
          if (msg.type === "push_design" && Array.isArray(msg.selectedElementIds)) {
            const doc = { type: "excalidraw", version: 2, elements: msg.elements, appState: msg.appState };
            const result = dehydrate(doc);
            entry.store.setDesign(result.mermaid, "user");
            entry.store.setCounts(result.nodeCount, result.edgeCount);
            entry.store.setSelectedElements(msg.selectedElementIds);
            console.error(`[${sessionName}] Design pushed: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
            broadcast(entry, { type: "history_changed" });

            if (persistence) {
              persistSession(persistence, sessionName, entry).catch((err) =>
                console.error(`[${sessionName}] Persist failed:`, err),
              );
            }
          }
        } catch (err) {
          console.error("Invalid WS message:", err);
        }
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(port, () => resolve());
  });

  const actualPort = (httpServer.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${actualPort}`;
  console.error(`Napkin shared server listening at ${baseUrl}`);

  return {
    url: baseUrl,
    port: actualPort,
    close: () => new Promise<void>((resolve) => {
      wss.close();
      httpServer.close(() => resolve());
    }),
  };
}
