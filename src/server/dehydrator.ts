/**
 * Dehydrator: converts Excalidraw JSON to Mermaid flowchart syntax.
 *
 * Thin wrapper around excalidraw-to-mermaid's convert() function.
 * Used server-side when the browser pushes Excalidraw scene data
 * via WebSocket for Claude to read as Mermaid text.
 */

import { convert } from "excalidraw-to-mermaid";

export interface DehydrationResult {
  mermaid: string;
  nodeCount: number;
  edgeCount: number;
}

/**
 * Convert an Excalidraw document object to Mermaid flowchart syntax.
 *
 * @param excalidrawDoc - Parsed Excalidraw JSON (must have an `elements` array)
 * @param direction - Optional direction override ("TD", "LR", "BT", "RL")
 * @returns DehydrationResult with mermaid text and counts
 */
export function dehydrate(
  excalidrawDoc: unknown,
  direction?: string,
): DehydrationResult {
  const options = direction ? { direction } : {};
  const result = convert(excalidrawDoc as Record<string, unknown>, options);

  return {
    mermaid: result.mermaid,
    nodeCount: result.nodeCount,
    edgeCount: result.edgeCount,
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
