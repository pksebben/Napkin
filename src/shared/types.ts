// WebSocket messages: client → server
export type ClientMessage = {
  type: "push_design";
  elements: unknown;
  appState: unknown;
  selectedElementIds: string[];
};

// WebSocket messages: server → client
export type ServerMessage =
  | { type: "design_update"; mermaid: string }
  | { type: "status"; url: string };

// State
export interface DesignSnapshot {
  mermaid: string;
  timestamp: string;
  source: "user" | "claude";
}

export interface NapkinState {
  currentDesign: string | null;
  selectedElements: string[];
  history: DesignSnapshot[];
}

export interface ReadDesignResult {
  mermaid: string | null;
  selectedElements: string[];
  nodeCount: number;
  edgeCount: number;
}

export interface WriteDesignResult {
  success: boolean;
  errors?: string[];
}
