import { describe, it, expect } from "vitest";
import { validateMermaid, type ValidationResult } from "./validator.js";

describe("validateMermaid", () => {
  it("accepts a valid flowchart", async () => {
    const result = await validateMermaid("flowchart TD\n  A --> B");
    expect(result).toEqual({ valid: true });
  });

  it("accepts a valid graph (flowchart alias)", async () => {
    const result = await validateMermaid("graph TD\n  A --> B");
    expect(result).toEqual({ valid: true });
  });

  it("rejects invalid syntax", async () => {
    const result = await validateMermaid("not a valid diagram {{{");
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("rejects an empty string", async () => {
    const result = await validateMermaid("");
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("rejects whitespace-only input", async () => {
    const result = await validateMermaid("   \n\t  ");
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("accepts a valid sequence diagram", async () => {
    const result = await validateMermaid(
      "sequenceDiagram\n  Alice->>Bob: Hello"
    );
    expect(result).toEqual({ valid: true });
  });

  it("accepts a valid classDiagram", async () => {
    const result = await validateMermaid(
      "classDiagram\n  class Animal\n  Animal : +String name"
    );
    expect(result).toEqual({ valid: true });
  });

  it("rejects erDiagram as unsupported by Excalidraw", async () => {
    const result = await validateMermaid(
      'erDiagram\n  SESSION ||--o{ SNAPSHOT : "has"'
    );
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain("Unsupported diagram type");
    expect(result.errors![0]).toContain("erDiagram");
    expect(result.errors![0]).toContain("flowchart");
  });

  it("rejects stateDiagram-v2 as unsupported by Excalidraw", async () => {
    const result = await validateMermaid(
      "stateDiagram-v2\n  [*] --> Idle"
    );
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain("Unsupported diagram type");
    expect(result.errors![0]).toContain("stateDiagram");
  });

  it("rejects pie chart as unsupported by Excalidraw", async () => {
    const result = await validateMermaid('pie\n  "Cats" : 40\n  "Dogs" : 60');
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain("Unsupported diagram type");
  });

  it("lists supported types in the rejection message", async () => {
    const result = await validateMermaid("gantt\n  title A Gantt");
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain("sequenceDiagram");
    expect(result.errors![0]).toContain("classDiagram");
    expect(result.errors![0]).toContain("flowchart");
  });
});
