import { describe, it, expect, afterEach } from "vitest";
import { SessionManager } from "./session-manager.js";

describe("SessionManager", () => {
  const manager = new SessionManager(undefined, 0);

  afterEach(async () => {
    await manager.destroyAll();
  });

  it("creates a session with auto-generated name", async () => {
    const info = await manager.createSession();
    expect(info.name).toMatch(/^napkin-[a-z0-9]{4}$/);
    expect(info.url).toMatch(/^http:\/\/localhost:\d+\/s\/napkin-[a-z0-9]{4}$/);
    expect(info.createdAt).toBeInstanceOf(Date);
  });

  it("creates a session with a given name", async () => {
    const info = await manager.createSession("my-session");
    expect(info.name).toBe("my-session");
    expect(info.url).toMatch(/^http:\/\/localhost:\d+\/s\/my-session$/);
  });

  it("returns existing session on duplicate name (idempotent)", async () => {
    const first = await manager.createSession("dup");
    const second = await manager.createSession("dup");
    expect(second.url).toBe(first.url);
  });

  it("destroys a session", async () => {
    await manager.createSession("doomed");
    await manager.destroySession("doomed");
    const list = await manager.listSessions();
    expect(list.find((s) => s.name === "doomed")).toBeUndefined();
  });

  it("lists all sessions", async () => {
    await manager.createSession("s1");
    await manager.createSession("s2");
    const list = await manager.listSessions();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name).sort()).toEqual(["s1", "s2"]);
  });

  it("destroyAll cleans up everything", async () => {
    await manager.createSession("a");
    await manager.createSession("b");
    await manager.destroyAll();
    // After destroyAll, server is shut down, so we need to re-ensure.
    // Creating a new session would start a new server.
    const info = await manager.createSession("c");
    const list = await manager.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("c");
  });

  it("reads and writes designs via HTTP", async () => {
    await manager.createSession("rw-test");

    // Initially null
    const initial = await manager.readDesign("rw-test");
    expect(initial.mermaid).toBeNull();

    // Write a design
    const result = await manager.writeDesign("rw-test", "graph TD\n  A-->B");
    expect(result.success).toBe(true);

    // Read it back
    const after = await manager.readDesign("rw-test");
    expect(after.mermaid).toBe("graph TD\n  A-->B");
  });

  it("writeDesign rejects invalid mermaid", async () => {
    await manager.createSession("bad-write");
    const result = await manager.writeDesign("bad-write", "");
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("gets history and rollback", async () => {
    await manager.createSession("hist-test");
    await manager.writeDesign("hist-test", "graph TD\n  A-->B");
    await manager.writeDesign("hist-test", "graph TD\n  C-->D");

    const history = await manager.getHistory("hist-test", 10);
    expect(history).toHaveLength(2);

    const result = await manager.rollback("hist-test", history[0].timestamp);
    expect(result.success).toBe(true);
    expect(result.mermaid).toBe("graph TD\n  A-->B");
  });

  it("multiple sessions share the same port", async () => {
    const info1 = await manager.createSession("port-test-1");
    const info2 = await manager.createSession("port-test-2");
    const url1 = new URL(info1.url);
    const url2 = new URL(info2.url);
    expect(url1.port).toBe(url2.port);
    expect(url1.pathname).toBe("/s/port-test-1");
    expect(url2.pathname).toBe("/s/port-test-2");
  });
});

describe("SessionManager multi-process", () => {
  it("second manager connects to existing server", async () => {
    // Use port 0 for the first manager so it picks a random port
    const manager1 = new SessionManager(undefined, 0);

    // First manager starts the server and gets a random port
    const info1 = await manager1.createSession("proc1-session");
    const actualPort = parseInt(new URL(info1.url).port, 10);

    // Second manager uses the same port — should detect the existing server
    const manager2 = new SessionManager(undefined, actualPort);

    try {
      const info2 = await manager2.createSession("proc2-session");

      // Both should share the same port
      const url1 = new URL(info1.url);
      const url2 = new URL(info2.url);
      expect(url1.port).toBe(url2.port);

      // Both sessions should be visible from either manager
      const list1 = await manager1.listSessions();
      const list2 = await manager2.listSessions();
      expect(list1.map((s) => s.name).sort()).toEqual(["proc1-session", "proc2-session"]);
      expect(list2.map((s) => s.name).sort()).toEqual(["proc1-session", "proc2-session"]);
    } finally {
      // manager2 doesn't own the server, so destroyAll only cleans its sessions
      await manager2.destroyAll();
      // manager1 owns the server, destroyAll shuts it down
      await manager1.destroyAll();
    }
  });
});
