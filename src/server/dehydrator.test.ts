import { describe, it, expect } from "vitest";
import { dehydrate, annotateSelection } from "./dehydrator.js";

describe("annotateSelection", () => {
  it("prepends a SELECTED comment when elements are selected", () => {
    const mermaid = "graph TD\n    A[Hello]\n";
    const result = annotateSelection(mermaid, ["node1", "node2"]);
    expect(result).toBe("%% SELECTED: node1, node2\ngraph TD\n    A[Hello]\n");
  });

  it("returns mermaid unchanged when selection is empty", () => {
    const mermaid = "graph TD\n    A[Hello]\n";
    const result = annotateSelection(mermaid, []);
    expect(result).toBe(mermaid);
  });
});

describe("dehydrate", () => {
  it("converts a minimal Excalidraw doc with two nodes and one edge", () => {
    // Minimal Excalidraw document with two rectangles connected by an arrow,
    // each with bound text elements. This matches the format that
    // excalidraw-to-mermaid's parseDocument expects.
    const doc = {
      elements: [
        {
          id: "rect1",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 150,
          height: 60,
          strokeStyle: "solid",
          isDeleted: false,
          boundElements: [{ id: "text1", type: "text" }],
        },
        {
          id: "text1",
          type: "text",
          x: 110,
          y: 115,
          width: 130,
          height: 30,
          text: "Start",
          originalText: "Start",
          containerId: "rect1",
          isDeleted: false,
        },
        {
          id: "rect2",
          type: "rectangle",
          x: 100,
          y: 300,
          width: 150,
          height: 60,
          strokeStyle: "solid",
          isDeleted: false,
          boundElements: [{ id: "text2", type: "text" }],
        },
        {
          id: "text2",
          type: "text",
          x: 110,
          y: 315,
          width: 130,
          height: 30,
          text: "End",
          originalText: "End",
          containerId: "rect2",
          isDeleted: false,
        },
        {
          id: "arrow1",
          type: "arrow",
          x: 175,
          y: 160,
          width: 0,
          height: 140,
          startBinding: { elementId: "rect1", focus: 0, gap: 1 },
          endBinding: { elementId: "rect2", focus: 0, gap: 1 },
          endArrowhead: "arrow",
          isDeleted: false,
        },
      ],
    };

    const result = dehydrate(doc);

    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(result.mermaid).toContain("Start");
    expect(result.mermaid).toContain("End");
    expect(result.mermaid).toContain("-->");
    expect(result.mermaid).toMatch(/^graph (TD|LR)/);
  });

  it("respects direction override", () => {
    const doc = {
      elements: [
        {
          id: "rect1",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 150,
          height: 60,
          strokeStyle: "solid",
          isDeleted: false,
        },
      ],
    };

    const result = dehydrate(doc, "LR");

    expect(result.mermaid).toMatch(/^graph LR/);
  });

  it("handles an empty document", () => {
    const doc = { elements: [] };

    const result = dehydrate(doc);

    expect(result.nodeCount).toBe(0);
    expect(result.edgeCount).toBe(0);
    expect(result.mermaid).toContain("graph");
  });

  it("emits style directives for nodes with custom colors", () => {
    const doc = {
      elements: [
        {
          id: "rect1",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 150,
          height: 60,
          strokeStyle: "solid",
          strokeColor: "#e03131",
          backgroundColor: "#ffe0e0",
          isDeleted: false,
          boundElements: [{ id: "text1", type: "text" }],
        },
        {
          id: "text1",
          type: "text",
          x: 110,
          y: 115,
          width: 130,
          height: 30,
          text: "Problem Node",
          originalText: "Problem Node",
          containerId: "rect1",
          isDeleted: false,
        },
      ],
    };

    const result = dehydrate(doc);

    expect(result.mermaid).toContain("style A fill:#ffe0e0,stroke:#e03131");
  });

  it("does not emit style directives for default-colored nodes", () => {
    const doc = {
      elements: [
        {
          id: "rect1",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 150,
          height: 60,
          strokeStyle: "solid",
          strokeColor: "#1e1e1e",
          backgroundColor: "transparent",
          isDeleted: false,
          boundElements: [{ id: "text1", type: "text" }],
        },
        {
          id: "text1",
          type: "text",
          x: 110,
          y: 115,
          width: 130,
          height: 30,
          text: "Normal",
          originalText: "Normal",
          containerId: "rect1",
          isDeleted: false,
        },
      ],
    };

    const result = dehydrate(doc);

    expect(result.mermaid).not.toContain("style ");
  });

  it("handles mixed colored and default nodes", () => {
    const doc = {
      elements: [
        {
          id: "rect1",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 150,
          height: 60,
          strokeStyle: "solid",
          strokeColor: "#1e1e1e",
          backgroundColor: "transparent",
          isDeleted: false,
          boundElements: [{ id: "text1", type: "text" }],
        },
        {
          id: "text1",
          type: "text",
          x: 110,
          y: 115,
          width: 130,
          height: 30,
          text: "Normal",
          originalText: "Normal",
          containerId: "rect1",
          isDeleted: false,
        },
        {
          id: "rect2",
          type: "rectangle",
          x: 100,
          y: 300,
          width: 150,
          height: 60,
          strokeStyle: "solid",
          strokeColor: "#2f9e44",
          backgroundColor: "#d3f9d8",
          isDeleted: false,
          boundElements: [{ id: "text2", type: "text" }],
        },
        {
          id: "text2",
          type: "text",
          x: 110,
          y: 315,
          width: 130,
          height: 30,
          text: "Approved",
          originalText: "Approved",
          containerId: "rect2",
          isDeleted: false,
        },
        {
          id: "arrow1",
          type: "arrow",
          x: 175,
          y: 160,
          width: 0,
          height: 140,
          startBinding: { elementId: "rect1", focus: 0, gap: 1 },
          endBinding: { elementId: "rect2", focus: 0, gap: 1 },
          endArrowhead: "arrow",
          isDeleted: false,
        },
      ],
    };

    const result = dehydrate(doc);

    // Only the second node (B) should have a style directive
    expect(result.mermaid).not.toContain("style A ");
    expect(result.mermaid).toContain("style B fill:#d3f9d8,stroke:#2f9e44");
  });
});
