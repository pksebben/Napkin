import { useState, useEffect, useRef, useCallback } from "react";
import {
  Excalidraw,
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { NapkinSocket } from "./ws-client";
import type { ServerMessage } from "../shared/types";

type Tab = "draft" | "claude";

const socket = new NapkinSocket();

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("draft");
  const [status, setStatus] = useState<string>("");
  const [helpCollapsed, setHelpCollapsed] = useState<boolean>(() =>
    localStorage.getItem("napkin-help-collapsed") === "true"
  );

  // Store elements for each tab in refs to avoid re-renders
  const draftElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const claudeElementsRef = useRef<readonly ExcalidrawElement[]>([]);

  // Track the active tab in a ref so the WS handler can read it without stale closures
  const activeTabRef = useRef<Tab>(activeTab);
  activeTabRef.current = activeTab;

  // Track the API in a ref for the same reason
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  apiRef.current = api;

  // Connect WebSocket on mount
  useEffect(() => {
    const wsUrl = `ws://${window.location.host}`;
    socket.connect(wsUrl);

    const unsub = socket.onMessage(async (msg: ServerMessage) => {
      if (msg.type === "design_update") {
        try {
          const { elements: skeleton } = await parseMermaidToExcalidraw(
            msg.mermaid
          );
          const elements = convertToExcalidrawElements(skeleton);
          claudeElementsRef.current = elements;

          // If we're currently viewing the Claude tab, update the scene
          if (activeTabRef.current === "claude" && apiRef.current) {
            apiRef.current.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }

          setStatus("Claude updated the design");
          setTimeout(() => setStatus(""), 3000);
        } catch (err) {
          console.error("Failed to hydrate mermaid:", err);
          setStatus("Failed to parse Claude's design");
          setTimeout(() => setStatus(""), 3000);
        }
      } else if (msg.type === "status") {
        setStatus(`Server: ${msg.url}`);
      }
    });

    return unsub;
  }, []);

  // Save current tab's elements before switching
  const switchTab = useCallback(
    (newTab: Tab) => {
      if (newTab === activeTab || !api) return;

      // Save current tab's elements
      const currentElements = api.getSceneElements();
      if (activeTab === "draft") {
        draftElementsRef.current = currentElements;
      } else {
        claudeElementsRef.current = currentElements;
      }

      // Load new tab's elements
      const nextElements =
        newTab === "draft"
          ? draftElementsRef.current
          : claudeElementsRef.current;

      api.updateScene({
        elements: nextElements as ExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      setActiveTab(newTab);
    },
    [activeTab, api]
  );

  // Push current design to Claude via WebSocket
  const handlePush = useCallback(() => {
    if (!api) return;

    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const selectedElementIds = Object.entries(
      appState.selectedElementIds || {}
    )
      .filter(([, selected]) => selected)
      .map(([id]) => id);

    socket.send({
      type: "push_design",
      elements,
      appState,
      selectedElementIds,
    });

    setStatus("Pushed design to Claude");
    setTimeout(() => setStatus(""), 3000);
  }, [api]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: 48,
          minHeight: 48,
          borderBottom: "1px solid #e0e0e0",
          backgroundColor: "#fff",
          zIndex: 10,
        }}
      >
        {/* Tabs on the left */}
        <div style={{ display: "flex", gap: 0 }}>
          <button
            onClick={() => switchTab("draft")}
            style={{
              padding: "12px 20px",
              border: "none",
              borderBottom:
                activeTab === "draft"
                  ? "2px solid #1971c2"
                  : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === "draft" ? 600 : 400,
              color: activeTab === "draft" ? "#1971c2" : "#666",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            My Draft
          </button>
          <button
            onClick={() => switchTab("claude")}
            style={{
              padding: "12px 20px",
              border: "none",
              borderBottom:
                activeTab === "claude"
                  ? "2px solid #1971c2"
                  : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === "claude" ? 600 : 400,
              color: activeTab === "claude" ? "#1971c2" : "#666",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            Claude's Revision
          </button>
        </div>

        {/* Status + Help + Push button on the right */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {status && (
            <span
              style={{
                fontSize: 13,
                color: "#666",
              }}
            >
              {status}
            </span>
          )}
          <button
            onClick={() => {
              const next = !helpCollapsed;
              setHelpCollapsed(next);
              localStorage.setItem("napkin-help-collapsed", String(next));
            }}
            title={helpCollapsed ? "Show help" : "Hide help"}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "1px solid #e0e0e0",
              background: helpCollapsed ? "#fff" : "#f0f0f0",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
              color: "#666",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            ?
          </button>
          <button
            onClick={handlePush}
            disabled={activeTab !== "draft"}
            style={{
              padding: "8px 20px",
              backgroundColor:
                activeTab === "draft" ? "#1971c2" : "#a0a0a0",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: activeTab === "draft" ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            Push to Claude
          </button>
        </div>
      </div>

      {/* Help panel */}
      {!helpCollapsed && (
        <div
          style={{
            padding: "12px 20px",
            backgroundColor: "#f8f9fa",
            borderBottom: "1px solid #e0e0e0",
            fontSize: 13,
            color: "#495057",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ fontSize: 14 }}>How to use Napkin</strong>
          <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            <li><strong>Draw</strong> your architecture on the <em>My Draft</em> tab</li>
            <li><strong>Push to Claude</strong> to share your design for feedback</li>
            <li>Check <strong>Claude's Revision</strong> tab to see suggested changes</li>
            <li><strong>Iterate</strong> — refine your draft, push again, repeat</li>
          </ol>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#868e96" }}>
            Highlighted nodes in Claude's revision:
            <span style={{ color: "#1971c2", fontWeight: 600 }}> blue</span> = discussing,
            <span style={{ color: "#fab005", fontWeight: 600 }}> yellow</span> = new/changed,
            <span style={{ color: "#e03131", fontWeight: 600 }}> red</span> = problem,
            <span style={{ color: "#2f9e44", fontWeight: 600 }}> green</span> = approved.
          </p>
        </div>
      )}

      {/* Excalidraw canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <Excalidraw
          excalidrawAPI={(excalidrawApi) => setApi(excalidrawApi)}
          viewModeEnabled={activeTab === "claude"}
        />
      </div>
    </div>
  );
}
