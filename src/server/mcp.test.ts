import { describe, it, expect, afterEach } from "vitest";
import { SessionManager } from "./session-manager.js";
import { createMcpServer } from "./mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

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

describe("MCP prompts", () => {
  it("napkin_guide prompt returns usage guide", async () => {
    const manager = new SessionManager(undefined, 0);
    const server = createMcpServer(manager);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.getPrompt({ name: "napkin_guide" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toMatchObject({ type: "text" });

    const text = (result.messages[0].content as { type: "text"; text: string }).text;
    expect(text).toContain("Napkin");
    expect(text).toContain("napkin_start");
    expect(text).toContain("flowchart TD");
    expect(text).toContain("fill:#d0ebff");

    await manager.destroyAll();
    await server.close();
    await client.close();
  });
});
