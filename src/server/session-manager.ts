import { startSharedServer, type SharedServerInstance } from "./shared-server.js";
import type { SessionPersistence } from "./persistence.js";
import type {
  ReadDesignResult,
  WriteDesignResult,
  DesignSnapshot,
} from "../shared/types.js";

export interface SessionInfo {
  name: string;
  url: string;
  createdAt: Date;
  snapshotCount: number;
}

export class SessionManager {
  private serverUrl: string | null = null;
  private ownsServer = false;
  private serverInstance: SharedServerInstance | null = null;
  private mySessions = new Set<string>();
  private persistence: SessionPersistence | null;
  private port: number;

  constructor(persistence?: SessionPersistence, port?: number) {
    this.persistence = persistence ?? null;
    this.port = port ?? parseInt(process.env.NAPKIN_PORT ?? "3210", 10);
  }

  /**
   * Ensure we have a server URL. First process starts the server;
   * subsequent processes detect the existing one.
   */
  async ensureServer(): Promise<string> {
    if (this.serverUrl) return this.serverUrl;

    // Probe for existing server
    try {
      const res = await fetch(`http://localhost:${this.port}/api/sessions`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        this.serverUrl = `http://localhost:${this.port}`;
        this.ownsServer = false;
        console.error(`Napkin: connected to existing server at ${this.serverUrl}`);
        return this.serverUrl;
      }
    } catch {
      // Server not running, we'll start one
    }

    // Start our own server
    try {
      this.serverInstance = await startSharedServer(
        this.port,
        this.persistence ?? undefined,
      );
      this.serverUrl = this.serverInstance.url;
      this.ownsServer = true;
      return this.serverUrl;
    } catch (err: unknown) {
      // Race condition: another process started the server between our probe and start
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "EADDRINUSE"
      ) {
        // Retry probe
        try {
          const res = await fetch(`http://localhost:${this.port}/api/sessions`, {
            signal: AbortSignal.timeout(2000),
          });
          if (res.ok) {
            this.serverUrl = `http://localhost:${this.port}`;
            this.ownsServer = false;
            console.error(`Napkin: connected to existing server at ${this.serverUrl} (after race)`);
            return this.serverUrl;
          }
        } catch {
          // Fall through to rethrow
        }
      }
      throw err;
    }
  }

  async createSession(name?: string): Promise<SessionInfo> {
    const serverUrl = await this.ensureServer();
    const res = await fetch(`${serverUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { name: string; createdAt: string; snapshotCount: number };
    this.mySessions.add(data.name);
    return {
      name: data.name,
      url: `${serverUrl}/s/${data.name}`,
      createdAt: new Date(data.createdAt),
      snapshotCount: data.snapshotCount,
    };
  }

  async readDesign(name: string): Promise<ReadDesignResult> {
    const serverUrl = await this.ensureServer();
    const res = await fetch(`${serverUrl}/api/sessions/${encodeURIComponent(name)}/design`);
    if (!res.ok) {
      throw new Error(`Failed to read design: ${res.status} ${await res.text()}`);
    }
    return await res.json() as ReadDesignResult;
  }

  async writeDesign(name: string, mermaid: string): Promise<WriteDesignResult> {
    const serverUrl = await this.ensureServer();
    const res = await fetch(`${serverUrl}/api/sessions/${encodeURIComponent(name)}/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid }),
    });
    const data = await res.json() as WriteDesignResult;
    return data;
  }

  async getHistory(name: string, limit: number): Promise<DesignSnapshot[]> {
    const serverUrl = await this.ensureServer();
    const res = await fetch(
      `${serverUrl}/api/sessions/${encodeURIComponent(name)}/history?limit=${limit}`,
    );
    if (!res.ok) {
      throw new Error(`Failed to get history: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { history: DesignSnapshot[] };
    return data.history;
  }

  async rollback(name: string, timestamp: string): Promise<{ success: boolean; mermaid?: string | null; error?: string }> {
    const serverUrl = await this.ensureServer();
    const res = await fetch(`${serverUrl}/api/sessions/${encodeURIComponent(name)}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp }),
    });
    return await res.json() as { success: boolean; mermaid?: string | null; error?: string };
  }

  async destroySession(name: string): Promise<void> {
    const serverUrl = await this.ensureServer();
    await fetch(`${serverUrl}/api/sessions/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    this.mySessions.delete(name);
  }

  async destroyAll(): Promise<void> {
    if (this.serverUrl) {
      // Only destroy sessions this process created
      for (const name of this.mySessions) {
        try {
          await fetch(`${this.serverUrl}/api/sessions/${encodeURIComponent(name)}`, {
            method: "DELETE",
          });
        } catch {
          // Best effort
        }
      }
      this.mySessions.clear();
    }

    // Shut down the server if we own it
    if (this.ownsServer && this.serverInstance) {
      await this.serverInstance.close();
      this.serverInstance = null;
      this.ownsServer = false;
    }
    this.serverUrl = null;
  }

  async listSessions(): Promise<SessionInfo[]> {
    const serverUrl = await this.ensureServer();
    const res = await fetch(`${serverUrl}/api/sessions`);
    if (!res.ok) {
      throw new Error(`Failed to list sessions: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as Array<{ name: string; createdAt: string; snapshotCount: number }>;
    return data.map((s) => ({
      name: s.name,
      url: `${serverUrl}/s/${s.name}`,
      createdAt: new Date(s.createdAt),
      snapshotCount: s.snapshotCount,
    }));
  }
}
