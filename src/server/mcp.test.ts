import { describe, it, expect, afterEach } from "vitest";
import { SessionManager } from "./session-manager.js";

/**
 * These tests verify the MCP tool logic through the SessionManager HTTP client,
 * which is the same path the MCP tool handlers use.
 */

describe("MCP tool logic via SessionManager", () => {
  const manager = new SessionManager(undefined, 0);

  afterEach(async () => {
    await manager.destroyAll();
  });

  it("readDesign returns null mermaid when no design exists", async () => {
    await manager.createSession("read-empty");
    const result = await manager.readDesign("read-empty");
    expect(result).toEqual({
      mermaid: null,
      selectedElements: [],
      nodeCount: 0,
      edgeCount: 0,
    });
  });

  it("writeDesign rejects invalid mermaid", async () => {
    await manager.createSession("write-bad");
    const result = await manager.writeDesign("write-bad", "");
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("writeDesign stores valid mermaid", async () => {
    await manager.createSession("write-good");
    const mermaid = "flowchart TD\n  A --> B";
    const result = await manager.writeDesign("write-good", mermaid);
    expect(result).toEqual({ success: true });

    const readResult = await manager.readDesign("write-good");
    expect(readResult.mermaid).toBe(mermaid);
  });

  it("getHistory returns empty history initially", async () => {
    await manager.createSession("hist-empty");
    const history = await manager.getHistory("hist-empty", 10);
    expect(history).toEqual([]);
  });

  it("getHistory returns history entries", async () => {
    await manager.createSession("hist-full");
    await manager.writeDesign("hist-full", "flowchart TD\n  A --> B");
    await manager.writeDesign("hist-full", "flowchart TD\n  A --> B --> C");
    const history = await manager.getHistory("hist-full", 10);
    expect(history).toHaveLength(2);
    expect(history[0].source).toBe("claude");
    expect(history[1].source).toBe("claude");
  });

  it("rollback restores a previous design", async () => {
    await manager.createSession("rb");
    await manager.writeDesign("rb", "flowchart TD\n  A --> B");
    await manager.writeDesign("rb", "flowchart TD\n  X --> Y");
    const history = await manager.getHistory("rb", 10);
    const result = await manager.rollback("rb", history[0].timestamp);
    expect(result.success).toBe(true);
    expect(result.mermaid).toBe("flowchart TD\n  A --> B");
  });

  it("rollback returns error on invalid timestamp", async () => {
    await manager.createSession("rb-bad");
    const result = await manager.rollback("rb-bad", "nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No snapshot found");
  });

  it("listSessions returns all sessions", async () => {
    await manager.createSession("ls1");
    await manager.createSession("ls2");
    const sessions = await manager.listSessions();
    expect(sessions.map((s) => s.name).sort()).toEqual(["ls1", "ls2"]);
  });

  it("destroySession removes a session", async () => {
    await manager.createSession("doomed");
    await manager.destroySession("doomed");
    const sessions = await manager.listSessions();
    expect(sessions.find((s) => s.name === "doomed")).toBeUndefined();
  });
});
