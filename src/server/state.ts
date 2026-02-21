import type { DesignSnapshot } from "../shared/types.js";

const MAX_HISTORY = 50;

export class StateStore {
  private currentDesign: string | null = null;
  private selectedElements: string[] = [];
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

  rollback(timestamp: string): void {
    const snapshot = this.history.find((s) => s.timestamp === timestamp);
    if (!snapshot) {
      throw new Error(`No snapshot found for timestamp: ${timestamp}`);
    }
    this.currentDesign = snapshot.mermaid;
  }
}
