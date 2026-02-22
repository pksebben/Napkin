import { describe, it, expect, afterEach } from "vitest";
import { startSharedServer, type SharedServerInstance } from "./shared-server.js";

describe("SharedServer", () => {
  let server: SharedServerInstance | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("starts on a random port and returns a URL", async () => {
    server = await startSharedServer(0);
    expect(server.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(server.port).toBeGreaterThan(0);
  });

  it("POST /api/sessions creates a session", async () => {
    server = await startSharedServer(0);
    const res = await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-session" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("test-session");
    expect(body.snapshotCount).toBe(0);
  });

  it("POST /api/sessions is idempotent for same name", async () => {
    server = await startSharedServer(0);
    const res1 = await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "idem" }),
    });
    expect(res1.status).toBe(201);

    const res2 = await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "idem" }),
    });
    expect(res2.status).toBe(200);
    const body = await res2.json();
    expect(body.name).toBe("idem");
  });

  it("POST /api/sessions auto-generates name if none given", async () => {
    server = await startSharedServer(0);
    const res = await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toMatch(/^napkin-[a-z0-9]{4}$/);
  });

  it("GET /api/sessions lists sessions", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "s1" }),
    });
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "s2" }),
    });

    const res = await fetch(`${server.url}/api/sessions`);
    const list = await res.json();
    expect(list).toHaveLength(2);
    expect(list.map((s: { name: string }) => s.name).sort()).toEqual(["s1", "s2"]);
  });

  it("DELETE /api/sessions/:name destroys a session", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "doomed" }),
    });

    const res = await fetch(`${server.url}/api/sessions/doomed`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const listRes = await fetch(`${server.url}/api/sessions`);
    const list = await listRes.json();
    expect(list).toHaveLength(0);
  });

  it("DELETE /api/sessions/:name returns 404 for unknown session", async () => {
    server = await startSharedServer(0);
    const res = await fetch(`${server.url}/api/sessions/nope`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("GET /api/sessions/:name/design reads design state", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "rd" }),
    });

    const res = await fetch(`${server.url}/api/sessions/rd/design`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mermaid).toBeNull();
    expect(body.selectedElements).toEqual([]);
    expect(body.nodeCount).toBe(0);
    expect(body.edgeCount).toBe(0);
  });

  it("GET /api/sessions/:name/design returns 404 for unknown session", async () => {
    server = await startSharedServer(0);
    const res = await fetch(`${server.url}/api/sessions/nope/design`);
    expect(res.status).toBe(404);
  });

  it("POST /api/sessions/:name/design writes a valid design", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "wd" }),
    });

    const res = await fetch(`${server.url}/api/sessions/wd/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: "graph TD\n  A-->B" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify the design was stored
    const readRes = await fetch(`${server.url}/api/sessions/wd/design`);
    const readBody = await readRes.json();
    expect(readBody.mermaid).toBe("graph TD\n  A-->B");
  });

  it("POST /api/sessions/:name/design rejects invalid mermaid", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "bad" }),
    });

    const res = await fetch(`${server.url}/api/sessions/bad/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("POST /api/sessions/:name/design returns 404 for unknown session", async () => {
    server = await startSharedServer(0);
    const res = await fetch(`${server.url}/api/sessions/nope/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: "graph TD\n  A-->B" }),
    });
    expect(res.status).toBe(404);
  });

  it("GET /api/sessions/:name/history returns history", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hist" }),
    });
    // Write a design to create history
    await fetch(`${server.url}/api/sessions/hist/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: "graph TD\n  A-->B" }),
    });

    const res = await fetch(`${server.url}/api/sessions/hist/history?limit=10`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toHaveLength(1);
    expect(body.history[0].source).toBe("claude");
  });

  it("GET /api/sessions/:name/history returns 404 for unknown session", async () => {
    server = await startSharedServer(0);
    const res = await fetch(`${server.url}/api/sessions/nope/history`);
    expect(res.status).toBe(404);
  });

  it("POST /api/sessions/:name/rollback restores a design", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "rb" }),
    });
    // Write two designs
    await fetch(`${server.url}/api/sessions/rb/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: "graph TD\n  A-->B" }),
    });
    await fetch(`${server.url}/api/sessions/rb/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: "graph TD\n  C-->D" }),
    });

    // Get history to find the first snapshot's timestamp
    const histRes = await fetch(`${server.url}/api/sessions/rb/history?limit=10`);
    const hist = await histRes.json();
    const firstTimestamp = hist.history[0].timestamp;

    const res = await fetch(`${server.url}/api/sessions/rb/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: firstTimestamp }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mermaid).toBe("graph TD\n  A-->B");
  });

  it("POST /api/sessions/:name/rollback returns 400 on bad timestamp", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "rb2" }),
    });

    const res = await fetch(`${server.url}/api/sessions/rb2/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/sessions/:name/rollback returns 400 on nonexistent timestamp", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "rb3" }),
    });

    const res = await fetch(`${server.url}/api/sessions/rb3/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: "fake" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("No snapshot found");
  });

  it("DELETE /api/sessions/:name/history/:timestamp deletes a snapshot", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "del" }),
    });
    await fetch(`${server.url}/api/sessions/del/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: "graph TD\n  A-->B" }),
    });

    const histRes = await fetch(`${server.url}/api/sessions/del/history?limit=10`);
    const hist = await histRes.json();
    const ts = hist.history[0].timestamp;

    const res = await fetch(
      `${server.url}/api/sessions/del/history/${encodeURIComponent(ts)}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it was deleted
    const histRes2 = await fetch(`${server.url}/api/sessions/del/history?limit=10`);
    const hist2 = await histRes2.json();
    expect(hist2.history).toHaveLength(0);
  });

  it("DELETE /api/sessions/:name/history/:timestamp returns 404 for unknown session", async () => {
    server = await startSharedServer(0);
    const res = await fetch(
      `${server.url}/api/sessions/nope/history/fake`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/sessions/:name/history/:timestamp returns 400 on error", async () => {
    server = await startSharedServer(0);
    await fetch(`${server.url}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "del2" }),
    });

    const res = await fetch(
      `${server.url}/api/sessions/del2/history/fake`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("No snapshot found");
  });
});
