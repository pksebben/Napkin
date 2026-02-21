import { describe, it, expect, beforeEach, vi } from "vitest";
import { StateStore } from "./state.js";
import {
  handleReadDesign,
  handleWriteDesign,
  handleGetHistory,
  handleRollback,
} from "./mcp.js";

describe("handleReadDesign", () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  it("returns null mermaid when no design exists", async () => {
    const result = await handleReadDesign(store);
    expect(result).toEqual({
      mermaid: null,
      selectedElements: [],
      nodeCount: 0,
      edgeCount: 0,
    });
  });

  it("returns current design with selected elements", async () => {
    store.setDesign("flowchart TD\n  A --> B", "user");
    store.setSelectedElements(["node1", "node2"]);
    const result = await handleReadDesign(store);
    expect(result).toEqual({
      mermaid: "flowchart TD\n  A --> B",
      selectedElements: ["node1", "node2"],
      nodeCount: 0,
      edgeCount: 0,
    });
  });
});

describe("handleWriteDesign", () => {
  let store: StateStore;
  const broadcastMock = vi.fn();
  const broadcast = broadcastMock as (mermaid: string) => void;

  beforeEach(() => {
    store = new StateStore();
    broadcastMock.mockClear();
  });

  it("rejects invalid mermaid", async () => {
    const result = await handleWriteDesign(store, "", broadcast);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it("stores valid mermaid and calls broadcast", async () => {
    const mermaid = "flowchart TD\n  A --> B";
    const result = await handleWriteDesign(store, mermaid, broadcast);
    expect(result).toEqual({ success: true });
    expect(store.getCurrentDesign()).toBe(mermaid);
    expect(broadcastMock).toHaveBeenCalledWith(mermaid);
  });
});

describe("handleGetHistory", () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  it("returns empty history initially", () => {
    const history = handleGetHistory(store, 10);
    expect(history).toEqual([]);
  });

  it("returns history entries", () => {
    store.setDesign("flowchart TD\n  A --> B", "user");
    store.setDesign("flowchart TD\n  A --> B --> C", "claude");
    const history = handleGetHistory(store, 10);
    expect(history).toHaveLength(2);
    expect(history[0].source).toBe("user");
    expect(history[1].source).toBe("claude");
  });
});

describe("handleRollback", () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  it("restores a previous design", () => {
    store.setDesign("flowchart TD\n  A --> B", "user");
    const timestamp = store.getHistory(1)[0].timestamp;
    store.setDesign("flowchart TD\n  X --> Y", "claude");
    handleRollback(store, timestamp);
    expect(store.getCurrentDesign()).toBe("flowchart TD\n  A --> B");
  });

  it("throws on invalid timestamp", () => {
    expect(() => handleRollback(store, "nonexistent")).toThrow();
  });
});
