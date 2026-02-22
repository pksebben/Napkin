import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { SessionPersistence, type PersistedSession } from "./persistence.js";

describe("SessionPersistence", () => {
  let tmpDir: string;
  let persistence: SessionPersistence;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "napkin-test-"));
    persistence = new SessionPersistence(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeSession = (name: string): PersistedSession => ({
    version: 1,
    name,
    createdAt: "2024-01-01T00:00:00Z",
    currentDesign: "flowchart TD\n  A --> B",
    nodeCount: 2,
    edgeCount: 1,
    selectedElements: [],
    history: [
      { mermaid: "flowchart TD\n  A --> B", timestamp: "2024-01-01T00:00:00Z", source: "user" },
    ],
  });

  it("returns null for nonexistent session", async () => {
    expect(await persistence.load("no-such-session")).toBeNull();
  });

  it("saves and loads a session", async () => {
    const data = makeSession("test");
    await persistence.save("test", data);
    const loaded = await persistence.load("test");
    expect(loaded).toEqual(data);
  });

  it("save is atomic (uses tmp + rename)", async () => {
    const data = makeSession("atomic-test");
    await persistence.save("atomic-test", data);
    // The .tmp file should not remain
    const files = await fs.readdir(tmpDir);
    expect(files).toEqual(["atomic-test.json"]);
  });

  it("deletes a session", async () => {
    const data = makeSession("doomed");
    await persistence.save("doomed", data);
    await persistence.delete("doomed");
    expect(await persistence.load("doomed")).toBeNull();
  });

  it("delete is idempotent for missing sessions", async () => {
    await expect(persistence.delete("nonexistent")).resolves.toBeUndefined();
  });

  it("rejects names with path traversal", async () => {
    await expect(persistence.load("../etc/passwd")).rejects.toThrow("Invalid session name");
    await expect(persistence.save("foo/bar", makeSession("x"))).rejects.toThrow("Invalid session name");
  });

  it("rejects empty name", async () => {
    await expect(persistence.load("")).rejects.toThrow("Invalid session name");
  });

  it("overwrites existing session on save", async () => {
    const v1 = makeSession("overwrite");
    await persistence.save("overwrite", v1);
    const v2 = { ...v1, currentDesign: "flowchart TD\n  X --> Y" };
    await persistence.save("overwrite", v2);
    const loaded = await persistence.load("overwrite");
    expect(loaded!.currentDesign).toBe("flowchart TD\n  X --> Y");
  });
});
