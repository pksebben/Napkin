import type { DesignSnapshot } from "../shared/types.js";

const MAX_HISTORY = 50;

export class StateStore {
  private currentDesign: string | null = null;
  private selectedElements: string[] = [];
  private nodeCount: number = 0;
  private edgeCount: number = 0;
  private history: DesignSnapshot[] = [];

  getCurrentDesign(): string | null {
    return this.currentDesign;
  }

  getSelectedElements(): string[] {
    return this.selectedElements;
  }

  setSelectedElements(ids: string[]): void {
    this.selectedElements = ids;
  }

  getNodeCount(): number {
    return this.nodeCount;
  }

  getEdgeCount(): number {
    return this.edgeCount;
  }

  setCounts(nodeCount: number, edgeCount: number): void {
    this.nodeCount = nodeCount;
    this.edgeCount = edgeCount;
  }

  setDesign(mermaid: string, source: "user" | "claude"): void {
    this.currentDesign = mermaid;
    this.history.push({
      mermaid,
      timestamp: new Date().toISOString(),
      source,
    });
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }
  }

  getHistory(limit: number): DesignSnapshot[] {
    return this.history.slice(-limit);
  }

  getSnapshotCount(): number {
    return this.history.length;
  }

  restore(
    currentDesign: string | null,
    history: DesignSnapshot[],
    nodeCount: number,
    edgeCount: number,
    selectedElements: string[],
  ): void {
    this.currentDesign = currentDesign;
    this.history = history.length > MAX_HISTORY
      ? history.slice(-MAX_HISTORY)
      : [...history];
    this.nodeCount = nodeCount;
    this.edgeCount = edgeCount;
    this.selectedElements = selectedElements;
  }

  rollback(timestamp: string): void {
    const snapshot = this.history.find((s) => s.timestamp === timestamp);
    if (!snapshot) {
      throw new Error(`No snapshot found for timestamp: ${timestamp}`);
    }
    this.currentDesign = snapshot.mermaid;
  }

  deleteSnapshot(timestamp: string): void {
    const idx = this.history.findIndex((s) => s.timestamp === timestamp);
    if (idx === -1) {
      throw new Error(`No snapshot found for timestamp: ${timestamp}`);
    }
    this.history.splice(idx, 1);
  }
}
