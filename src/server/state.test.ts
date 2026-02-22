import { describe, it, expect, beforeEach } from "vitest";
import { StateStore } from "./state.js";

describe("StateStore", () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  it("starts with no design", () => {
    expect(store.getCurrentDesign()).toBeNull();
  });

  it("stores a user design", () => {
    store.setDesign("flowchart TD\n  A --> B", "user");
    expect(store.getCurrentDesign()).toBe("flowchart TD\n  A --> B");
  });

  it("stores selected elements", () => {
    store.setSelectedElements(["node1", "node2"]);
    expect(store.getSelectedElements()).toEqual(["node1", "node2"]);
  });

  it("snapshots to history on setDesign", () => {
    store.setDesign("flowchart TD\n  A --> B", "user");
    store.setDesign("flowchart TD\n  A --> B --> C", "claude");
    const history = store.getHistory(10);
    expect(history).toHaveLength(2);
    expect(history[0].source).toBe("user");
    expect(history[1].source).toBe("claude");
  });

  it("limits history length", () => {
    for (let i = 0; i < 60; i++) {
      store.setDesign(`flowchart TD\n  A${i} --> B`, "user");
    }
    expect(store.getHistory(100).length).toBeLessThanOrEqual(50);
  });

  it("rolls back to a previous snapshot", () => {
    store.setDesign("flowchart TD\n  A --> B", "user");
    const history = store.getHistory(10);
    const timestamp = history[0].timestamp;
    store.setDesign("flowchart TD\n  X --> Y", "claude");
    store.rollback(timestamp);
    expect(store.getCurrentDesign()).toBe("flowchart TD\n  A --> B");
  });

  it("throws on rollback to nonexistent timestamp", () => {
    expect(() => store.rollback("fake")).toThrow();
  });

  it("restores state from persisted data", () => {
    const history = [
      { mermaid: "flowchart TD\n  A --> B", timestamp: "2024-01-01T00:00:00Z", source: "user" as const },
      { mermaid: "flowchart TD\n  A --> B --> C", timestamp: "2024-01-01T00:01:00Z", source: "claude" as const },
    ];
    store.restore("flowchart TD\n  A --> B --> C", history, 3, 2, ["node1"]);
    expect(store.getCurrentDesign()).toBe("flowchart TD\n  A --> B --> C");
    expect(store.getHistory(10)).toHaveLength(2);
    expect(store.getNodeCount()).toBe(3);
    expect(store.getEdgeCount()).toBe(2);
    expect(store.getSelectedElements()).toEqual(["node1"]);
  });

  it("restore enforces MAX_HISTORY", () => {
    const history = Array.from({ length: 60 }, (_, i) => ({
      mermaid: `flowchart TD\n  A${i} --> B`,
      timestamp: `2024-01-01T00:${String(i).padStart(2, "0")}:00Z`,
      source: "user" as const,
    }));
    store.restore(null, history, 0, 0, []);
    expect(store.getHistory(100).length).toBeLessThanOrEqual(50);
    // Should keep the latest entries
    expect(store.getHistory(1)[0].mermaid).toBe("flowchart TD\n  A59 --> B");
  });

  it("restore does not share array reference", () => {
    const history: { mermaid: string; timestamp: string; source: "user" | "claude" }[] = [
      { mermaid: "flowchart TD\n  A --> B", timestamp: "2024-01-01T00:00:00Z", source: "user" },
    ];
    store.restore(null, history, 0, 0, []);
    history.push({ mermaid: "extra", timestamp: "2024-01-02T00:00:00Z", source: "claude" });
    expect(store.getHistory(10)).toHaveLength(1);
  });

  it("returns snapshot count", () => {
    expect(store.getSnapshotCount()).toBe(0);
    store.setDesign("flowchart TD\n  A --> B", "user");
    expect(store.getSnapshotCount()).toBe(1);
    store.setDesign("flowchart TD\n  A --> B --> C", "claude");
    expect(store.getSnapshotCount()).toBe(2);
  });

  it("deletes a snapshot by timestamp", () => {
    store.setDesign("flowchart TD\n  A --> B", "user");
    store.setDesign("flowchart TD\n  X --> Y", "claude");
    const ts = store.getHistory(10)[0].timestamp;
    store.deleteSnapshot(ts);
    expect(store.getSnapshotCount()).toBe(1);
    expect(store.getHistory(10)[0].source).toBe("claude");
  });

  it("throws on delete with nonexistent timestamp", () => {
    expect(() => store.deleteSnapshot("fake")).toThrow();
  });

  it("delete does not affect currentDesign", () => {
    store.setDesign("flowchart TD\n  A --> B", "user");
    const ts = store.getHistory(10)[0].timestamp;
    store.deleteSnapshot(ts);
    expect(store.getCurrentDesign()).toBe("flowchart TD\n  A --> B");
    expect(store.getSnapshotCount()).toBe(0);
  });
});
