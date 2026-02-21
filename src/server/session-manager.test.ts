import { describe, it, expect, afterEach } from "vitest";
import { SessionManager } from "./session-manager.js";

describe("SessionManager", () => {
  const manager = new SessionManager();

  afterEach(async () => {
    await manager.destroyAll();
  });

  it("creates a session with auto-generated name", async () => {
    const info = await manager.createSession();
    expect(info.name).toMatch(/^napkin-[a-z0-9]{4}$/);
    expect(info.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(info.createdAt).toBeInstanceOf(Date);
  });

  it("creates a session with a given name", async () => {
    const info = await manager.createSession("my-session");
    expect(info.name).toBe("my-session");
    expect(info.url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it("returns existing session on duplicate name (idempotent)", async () => {
    const first = await manager.createSession("dup");
    const second = await manager.createSession("dup");
    expect(second.url).toBe(first.url);
    expect(second.createdAt).toEqual(first.createdAt);
  });

  it("gets an existing session", async () => {
    const info = await manager.createSession("get-test");
    const session = manager.getSession("get-test");
    expect(session.store).toBeDefined();
    expect(session.httpServer).toBeDefined();
  });

  it("throws when getting unknown session", () => {
    expect(() => manager.getSession("nonexistent")).toThrow("No session found: nonexistent");
  });

  it("destroys a session and stops its server", async () => {
    await manager.createSession("doomed");
    await manager.destroySession("doomed");
    expect(() => manager.getSession("doomed")).toThrow();
  });

  it("lists all sessions", async () => {
    await manager.createSession("s1");
    await manager.createSession("s2");
    const list = manager.listSessions();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name).sort()).toEqual(["s1", "s2"]);
  });

  it("destroyAll cleans up everything", async () => {
    await manager.createSession("a");
    await manager.createSession("b");
    await manager.destroyAll();
    expect(manager.listSessions()).toHaveLength(0);
  });

  it("broadcasts to a session", async () => {
    const info = await manager.createSession("bc-test");
    // Should not throw — no connected clients, but function exists
    expect(() => manager.broadcastToSession("bc-test", "flowchart TD\n  A --> B")).not.toThrow();
  });
});
