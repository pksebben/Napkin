import { StateStore } from "./state.js";
import { startHttpServer, type HttpServerInstance } from "./http-server.js";
import { dehydrate } from "./dehydrator.js";

export interface Session {
  name: string;
  store: StateStore;
  httpServer: HttpServerInstance;
  createdAt: Date;
}

export interface SessionInfo {
  name: string;
  url: string;
  createdAt: Date;
  snapshotCount: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  generateName(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let suffix = "";
    for (let i = 0; i < 4; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    return `napkin-${suffix}`;
  }

  async createSession(name?: string): Promise<SessionInfo> {
    const sessionName = name ?? this.generateName();

    // Idempotent: return existing if name taken
    const existing = this.sessions.get(sessionName);
    if (existing) {
      return this.toSessionInfo(existing);
    }

    const store = new StateStore();

    const onPushDesign = (elements: unknown, appState: unknown, selectedElementIds: string[]): void => {
      try {
        const doc = { type: "excalidraw", version: 2, elements, appState };
        const result = dehydrate(doc);
        store.setDesign(result.mermaid, "user");
        store.setCounts(result.nodeCount, result.edgeCount);
        store.setSelectedElements(selectedElementIds);
        console.error(`[${sessionName}] Design pushed: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
      } catch (err) {
        console.error(`[${sessionName}] Dehydration failed:`, err);
      }
    };

    const httpServer = await startHttpServer({ port: 0, onPushDesign });

    const session: Session = {
      name: sessionName,
      store,
      httpServer,
      createdAt: new Date(),
    };

    this.sessions.set(sessionName, session);
    return this.toSessionInfo(session);
  }

  getSession(name: string): Session {
    const session = this.sessions.get(name);
    if (!session) {
      throw new Error(`No session found: ${name}`);
    }
    return session;
  }

  getSessionInfo(name: string): SessionInfo {
    return this.toSessionInfo(this.getSession(name));
  }

  async destroySession(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await session.httpServer.close();
      this.sessions.delete(name);
    }
  }

  async destroyAll(): Promise<void> {
    const names = [...this.sessions.keys()];
    await Promise.all(names.map((name) => this.destroySession(name)));
  }

  listSessions(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => this.toSessionInfo(s));
  }

  broadcastToSession(name: string, mermaid: string): void {
    const session = this.getSession(name);
    session.httpServer.broadcast({ type: "design_update", mermaid });
  }

  private toSessionInfo(session: Session): SessionInfo {
    return {
      name: session.name,
      url: session.httpServer.url,
      createdAt: session.createdAt,
      snapshotCount: session.store.getSnapshotCount(),
    };
  }
}
