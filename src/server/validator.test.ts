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

  it("accepts a valid pie chart (parser-supported type)", async () => {
    const result = await validateMermaid('pie\n  "Cats" : 40\n  "Dogs" : 60');
    expect(result).toEqual({ valid: true });
  });

  it("rejects an invalid pie chart", async () => {
    const result = await validateMermaid(
      "pie\n  not-a-section ==== garbage"
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
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
});
