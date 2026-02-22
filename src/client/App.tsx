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
import type { ServerMessage, DesignSnapshot } from "../shared/types";
import { HIGHLIGHT_COLORS, type HighlightColorName } from "../shared/colors";
import HistoryPanel from "./HistoryPanel";

type SidebarTab = "help" | "history";

function getSessionFromPath(): string | null {
  const match = window.location.pathname.match(/^\/s\/([^/]+)/);
  return match ? match[1] : null;
}

const socket = new NapkinSocket();

const SIDEBAR_MIN_WIDTH = 20;
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 600;

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<string>("");
  const [lastSource, setLastSource] = useState<"user" | "claude" | null>(null);
  const [sessionName, setSessionName] = useState<string | null>(getSessionFromPath);
  const [sessions, setSessions] = useState<string[]>([]);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("history");
  const [history, setHistory] = useState<DesignSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const isDragging = useRef(false);

  // Track the API in a ref so the WS handler can read it without stale closures
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  apiRef.current = api;

  // Fetch session list
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch("/api/sessions");
        const list = await res.json();
        setSessions(list);
      } catch {
        // Server not ready yet
      }
    };
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch history for the history panel
  const fetchHistory = useCallback(async () => {
    if (!sessionName) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionName}/history?limit=50`);
      if (res.ok) {
        const body = await res.json();
        setHistory(body.history);
      }
    } catch {
      // Server not ready
    } finally {
      setHistoryLoading(false);
    }
  }, [sessionName]);

  // Fetch history when switching to history tab
  useEffect(() => {
    if (sidebarTab === "history") {
      fetchHistory();
    }
  }, [sidebarTab, fetchHistory]);

  // Connect WebSocket on mount (or when session changes)
  useEffect(() => {
    console.log("[napkin] WS effect, sessionName =", sessionName);
    if (!sessionName) return;

    const wsUrl = `ws://${window.location.host}/s/${sessionName}/ws`;
    console.log("[napkin] Connecting WS to", wsUrl);
    socket.connect(wsUrl);

    const unsub = socket.onMessage(async (msg: ServerMessage) => {
      if (msg.type === "design_update") {
        try {
          const { elements: skeleton } = await parseMermaidToExcalidraw(
            msg.mermaid
          );
          const elements = convertToExcalidrawElements(skeleton);

          if (apiRef.current) {
            apiRef.current.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }

          setLastSource("claude");
          setStatus("Claude updated the design");
          setTimeout(() => setStatus(""), 3000);
        } catch (err) {
          console.error("Failed to hydrate mermaid:", err);
          setStatus("Failed to parse Claude's design");
          setTimeout(() => setStatus(""), 3000);
        }
      } else if (msg.type === "history_changed") {
        fetchHistory();
      } else if (msg.type === "status") {
        setStatus(`Server: ${msg.url}`);
      }
    });

    return unsub;
  }, [sessionName, fetchHistory]);

  // Clear the canvas for a new design
  const handleNew = useCallback(() => {
    if (!api) return;
    api.updateScene({
      elements: [],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    setLastSource(null);
    setStatus("");
  }, [api]);

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

    setLastSource("user");
    setStatus("Design pushed to Claude");
    setTimeout(() => setStatus(""), 3000);
  }, [api]);

  // Restore a previous design from history
  const handleRestore = useCallback(
    async (timestamp: string) => {
      if (!sessionName) return;
      // Look up the source from the history array
      const snap = history.find((s) => s.timestamp === timestamp);
      try {
        const res = await fetch(`/api/sessions/${sessionName}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timestamp }),
        });
        if (res.ok) {
          if (snap) setLastSource(snap.source);
          setStatus("Design restored");
          setTimeout(() => setStatus(""), 3000);
        } else {
          const body = await res.json();
          setStatus(`Restore failed: ${body.error}`);
          setTimeout(() => setStatus(""), 3000);
        }
      } catch {
        setStatus("Restore failed");
        setTimeout(() => setStatus(""), 3000);
      }
    },
    [sessionName, history]
  );

  // Delete a history snapshot
  const handleDelete = useCallback(
    async (timestamp: string) => {
      if (!sessionName) return;
      try {
        const res = await fetch(
          `/api/sessions/${sessionName}/history/${encodeURIComponent(timestamp)}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          setStatus("Snapshot deleted");
          setTimeout(() => setStatus(""), 3000);
        } else {
          const body = await res.json();
          setStatus(`Delete failed: ${body.error}`);
          setTimeout(() => setStatus(""), 3000);
        }
      } catch {
        setStatus("Delete failed");
        setTimeout(() => setStatus(""), 3000);
      }
    },
    [sessionName]
  );

  // Apply highlight color to selected elements
  const applyHighlight = useCallback(
    (colorName: HighlightColorName | null) => {
      if (!api) return;
      const appState = api.getAppState();
      const selectedIds = new Set(
        Object.entries(appState.selectedElementIds || {})
          .filter(([, selected]) => selected)
          .map(([id]) => id)
      );
      if (selectedIds.size === 0) return;

      const elements = api.getSceneElements();
      const updated = elements.map((el) => {
        if (!selectedIds.has(el.id)) return el;
        if (colorName === null) {
          return {
            ...el,
            backgroundColor: "transparent",
            strokeColor: "#1e1e1e",
          };
        }
        const color = HIGHLIGHT_COLORS[colorName];
        return {
          ...el,
          backgroundColor: color.fill,
          strokeColor: color.stroke,
        };
      });

      api.updateScene({
        elements: updated as ExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [api]
  );

  // Scroll-to-zoom: intercept wheel events and zoom instead of pan
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const currentApi = apiRef.current;
      if (!currentApi) return;

      e.preventDefault();

      const appState = currentApi.getAppState();
      const currentZoom = appState.zoom.value;

      // Zoom factor: smaller delta = finer control
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      const newZoom = Math.max(0.1, Math.min(10, currentZoom * factor));

      // Zoom toward cursor position
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Canvas coords of cursor before zoom
      const canvasX = (cursorX - appState.scrollX) / currentZoom;
      const canvasY = (cursorY - appState.scrollY) / currentZoom;

      // Adjust scroll so cursor stays over same canvas point
      const newScrollX = cursorX - canvasX * newZoom;
      const newScrollY = cursorY - canvasY * newZoom;

      currentApi.updateScene({
        appState: {
          zoom: { value: newZoom },
          scrollX: newScrollX,
          scrollY: newScrollY,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Sidebar resize drag handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      // Dragging left increases sidebar width (sidebar is on the right)
      const delta = startX - ev.clientX;
      const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth]);

  // No session in URL — show a landing page
  if (!sessionName) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#333",
        }}
      >
        <h1 style={{ marginBottom: 8 }}>Napkin</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>
          Start a session via Claude to begin designing.
        </p>
        {sessions.length > 0 && (
          <div>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
              Active sessions:
            </p>
            {sessions.map((s) => (
              <a
                key={s}
                href={`/s/${s}`}
                style={{
                  display: "block",
                  padding: "8px 16px",
                  marginBottom: 4,
                  borderRadius: 6,
                  backgroundColor: "#f0f4ff",
                  color: "#1971c2",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                {s}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

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
        {/* Source badge + color pickers on the left */}
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          {/* Source badge */}
          {lastSource && (
            <span
              style={{
                display: "inline-block",
                padding: "4px 10px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                marginRight: 12,
                backgroundColor: lastSource === "claude" ? "#e7f5ff" : "#f3f0ff",
                color: lastSource === "claude" ? "#1971c2" : "#7048e8",
              }}
            >
              {lastSource === "claude" ? "Claude's design" : "Your design"}
            </span>
          )}

          {/* Separator */}
          {lastSource && (
            <div
              style={{
                width: 1,
                height: 24,
                backgroundColor: "#e0e0e0",
                margin: "0 12px 0 0",
              }}
            />
          )}

          {/* Color picker buttons */}
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColorName[]).map(
            (colorName) => (
              <button
                key={colorName}
                onClick={() => applyHighlight(colorName)}
                title={HIGHLIGHT_COLORS[colorName].label}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  border: `2px solid ${HIGHLIGHT_COLORS[colorName].stroke}`,
                  backgroundColor: HIGHLIGHT_COLORS[colorName].fill,
                  cursor: "pointer",
                  marginRight: 4,
                  padding: 0,
                }}
              />
            )
          )}
          <button
            onClick={() => applyHighlight(null)}
            title="Clear highlight"
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              border: "1px solid #ccc",
              backgroundColor: "#fff",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: "24px",
              padding: 0,
              color: "#999",
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>

        {/* Status + Session picker + buttons on the right */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {status && (
            <span style={{ fontSize: 13, color: "#666" }}>{status}</span>
          )}

          {/* Session picker */}
          {sessions.length > 1 && (
            <select
              value={sessionName}
              onChange={(e) => {
                window.location.href = `/s/${e.target.value}`;
              }}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #e0e0e0",
                fontSize: 13,
                fontFamily: "inherit",
                color: "#333",
                backgroundColor: "#fff",
              }}
            >
              {sessions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {sessions.length <= 1 && (
            <span
              style={{
                fontSize: 13,
                color: "#999",
                fontFamily: "monospace",
              }}
            >
              {sessionName}
            </span>
          )}

          <button
            onClick={handleNew}
            style={{
              padding: "8px 16px",
              backgroundColor: "#fff",
              color: "#495057",
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            New
          </button>
          <button
            onClick={handlePush}
            style={{
              padding: "8px 20px",
              backgroundColor: "#1971c2",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            Push to Claude
          </button>
        </div>
      </div>

      {/* Main content: canvas + sidebar */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Excalidraw canvas */}
        <div ref={canvasRef} style={{ flex: 1, position: "relative" }}>
          <Excalidraw
            excalidrawAPI={(excalidrawApi) => setApi(excalidrawApi)}
          />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            width: 6,
            cursor: "col-resize",
            backgroundColor: "transparent",
            flexShrink: 0,
            position: "relative",
            zIndex: 20,
          }}
        >
          {/* Visible grip line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 2,
              width: 2,
              backgroundColor: "#e0e0e0",
            }}
          />
        </div>

        {/* Right sidebar — always visible */}
        <div
          style={{
            width: sidebarWidth,
            minWidth: SIDEBAR_MIN_WIDTH,
            borderLeft: "1px solid #e0e0e0",
            backgroundColor: "#f8f9fa",
            display: "flex",
            flexDirection: "column",
            fontSize: 13,
            color: "#495057",
            lineHeight: 1.6,
          }}
        >
          {/* Sidebar tabs */}
          {sidebarWidth > 60 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid #e0e0e0",
              padding: "0 8px",
              minHeight: 36,
            }}
          >
            {(["help", "history"] as SidebarTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  borderBottom:
                    sidebarTab === tab
                      ? "2px solid #1971c2"
                      : "2px solid transparent",
                  background: "none",
                  cursor: "pointer",
                  fontWeight: sidebarTab === tab ? 600 : 400,
                  color: sidebarTab === tab ? "#1971c2" : "#666",
                  fontSize: 13,
                  fontFamily: "inherit",
                  textTransform: "capitalize",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          )}

          {/* Sidebar content */}
          <div style={{ flex: 1, overflowY: "auto", padding: sidebarWidth > 60 ? 16 : 0, overflow: "hidden" }}>
            {sidebarTab === "help" && (
              <>
                <ol style={{ margin: "0 0 16px", paddingLeft: 20 }}>
                  <li>
                    <strong>Draw</strong> your architecture on the canvas
                  </li>
                  <li>
                    <strong>Push to Claude</strong> to share your design for
                    feedback
                  </li>
                  <li>
                    Claude's revisions appear{" "}
                    <strong>directly on the canvas</strong>
                  </li>
                  <li>
                    Use <strong>History</strong> to browse and restore
                    previous versions
                  </li>
                  <li>
                    <strong>Iterate</strong> — edit, push, repeat
                  </li>
                </ol>

                <strong style={{ fontSize: 13 }}>
                  Highlight colors (both directions)
                </strong>
                <div style={{ marginTop: 8 }}>
                  {(
                    Object.entries(HIGHLIGHT_COLORS) as [
                      HighlightColorName,
                      (typeof HIGHLIGHT_COLORS)[HighlightColorName],
                    ][]
                  ).map(([name, color]) => (
                    <div
                      key={name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          border: `2px solid ${color.stroke}`,
                          backgroundColor: color.fill,
                          flexShrink: 0,
                        }}
                      />
                      <span>
                        <strong style={{ color: color.stroke }}>{name}</strong>{" "}
                        = {color.label}
                      </span>
                    </div>
                  ))}
                </div>
                <p
                  style={{
                    margin: "12px 0 0",
                    fontSize: 12,
                    color: "#868e96",
                  }}
                >
                  Select nodes → use color buttons → Push to Claude.
                  <br />
                  Claude uses the same colors in its revisions.
                </p>
              </>
            )}

            {sidebarTab === "history" && (
              <HistoryPanel
                history={history}
                loading={historyLoading}
                onRestore={handleRestore}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
