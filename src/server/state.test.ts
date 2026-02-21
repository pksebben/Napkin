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

  it("returns snapshot count", () => {
    expect(store.getSnapshotCount()).toBe(0);
    store.setDesign("flowchart TD\n  A --> B", "user");
    expect(store.getSnapshotCount()).toBe(1);
    store.setDesign("flowchart TD\n  A --> B --> C", "claude");
    expect(store.getSnapshotCount()).toBe(2);
  });
});
