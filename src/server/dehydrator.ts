/**
 * Dehydrator: converts Excalidraw JSON to Mermaid flowchart syntax.
 *
 * Uses excalidraw-to-mermaid's parseDocument() + toMermaid() to generate
 * base Mermaid, then appends `style` directives for nodes with custom colors.
 */

import { parseDocument, toMermaid } from "excalidraw-to-mermaid";
import type { GraphNode } from "excalidraw-to-mermaid";

export interface DehydrationResult {
  mermaid: string;
  nodeCount: number;
  edgeCount: number;
}

/** Default Excalidraw colors that should NOT produce style directives. */
const DEFAULT_BG = new Set(["transparent", "#ffffff", ""]);
const DEFAULT_STROKE = new Set(["#1e1e1e", "#000000", ""]);

/**
 * Replicate the library's shortId() logic.
 * Maps index 0→A, 1→B, ..., 25→Z, 26→AA, 27→AB, etc.
 */
function shortId(index: number): string {
  let result = "";
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/**
 * Build a Map from original node ID to short Mermaid ID (A, B, C, ...),
 * replicating the library's assignIds() insertion-order traversal.
 */
function assignIds(nodes: Map<string, GraphNode>): Map<string, string> {
  const idMap = new Map<string, string>();
  let i = 0;
  for (const key of nodes.keys()) {
    idMap.set(key, shortId(i));
    i++;
  }
  return idMap;
}

/**
 * Generate `style` directives for nodes with non-default colors.
 */
function generateStyleDirectives(
  nodes: Map<string, GraphNode>,
  idMap: Map<string, string>,
): string[] {
  const lines: string[] = [];
  for (const [origId, node] of nodes) {
    const bg = node.backgroundColor ?? "";
    const stroke = node.strokeColor ?? "";
    const hasCustomBg = bg && !DEFAULT_BG.has(bg);
    const hasCustomStroke = stroke && !DEFAULT_STROKE.has(stroke);

    if (hasCustomBg || hasCustomStroke) {
      const sid = idMap.get(origId)!;
      const parts: string[] = [];
      if (hasCustomBg) parts.push(`fill:${bg}`);
      if (hasCustomStroke) parts.push(`stroke:${stroke}`);
      lines.push(`    style ${sid} ${parts.join(",")}`);
    }
  }
  return lines;
}

/**
 * Convert an Excalidraw document object to Mermaid flowchart syntax.
 * Preserves node highlight colors as Mermaid `style` directives.
 *
 * @param excalidrawDoc - Parsed Excalidraw JSON (must have an `elements` array)
 * @param direction - Optional direction override ("TD", "LR", "BT", "RL")
 * @returns DehydrationResult with mermaid text and counts
 */
export function dehydrate(
  excalidrawDoc: unknown,
  direction?: "TD" | "LR" | "BT" | "RL",
): DehydrationResult {
  const options = direction ? { direction } : {};
  const graph = parseDocument(excalidrawDoc as Record<string, unknown>);
  const base = toMermaid(graph, options);

  const idMap = assignIds(graph.nodes);
  const styleLines = generateStyleDirectives(graph.nodes, idMap);

  const mermaid = styleLines.length > 0
    ? base.trimEnd() + "\n" + styleLines.join("\n") + "\n"
    : base;

  return {
    mermaid,
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
  };
}

/**
 * Annotate Mermaid text with a comment listing selected element IDs.
 *
 * If selectedElements is non-empty, prepends a Mermaid comment line:
 *   %% SELECTED: id1, id2, id3
 *
 * This lets Claude know which elements the user has selected on the canvas.
 *
 * @param mermaid - The Mermaid flowchart text
 * @param selectedElements - Array of selected element IDs
 * @returns Annotated mermaid text, or unchanged if no selection
 */
export function annotateSelection(
  mermaid: string,
  selectedElements: string[],
): string {
  if (selectedElements.length === 0) {
    return mermaid;
  }
  return `%% SELECTED: ${selectedElements.join(", ")}\n${mermaid}`;
}
