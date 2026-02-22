import { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";
import type { DesignSnapshot } from "../shared/types";

mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MermaidThumbnail({ mermaid: mermaidText, id }: { mermaid: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const { svg } = await mermaid.render(`thumb-${id}`, mermaidText);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    render();
    return () => { cancelled = true; };
  }, [mermaidText, id]);

  if (error) {
    return (
      <div style={{ fontSize: 10, color: "#adb5bd", fontStyle: "italic", padding: "8px 0" }}>
        Preview unavailable
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        maxHeight: 100,
        overflow: "hidden",
        borderRadius: 4,
        backgroundColor: "#fafafa",
        marginBottom: 6,
      }}
    />
  );
}

interface HistoryPanelProps {
  history: DesignSnapshot[];
  loading: boolean;
  onRestore: (timestamp: string) => void;
  onDelete: (timestamp: string) => void;
}

export default function HistoryPanel({ history, loading, onRestore, onDelete }: HistoryPanelProps) {
  const [restoringTs, setRestoringTs] = useState<string | null>(null);
  const [deletingTs, setDeletingTs] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{ color: "#868e96", fontSize: 13, padding: "12px 0" }}>
        Loading history...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div style={{ color: "#868e96", fontSize: 13, padding: "12px 0" }}>
        No history yet. Push a design to get started.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {[...history].reverse().map((snap, idx) => (
        <div
          key={snap.timestamp}
          style={{
            padding: "8px 10px",
            backgroundColor: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span style={{ color: "#868e96" }}>{relativeTime(snap.timestamp)}</span>
            <span
              style={{
                display: "inline-block",
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 11,
                fontWeight: 600,
                backgroundColor: snap.source === "claude" ? "#e7f5ff" : "#f3f0ff",
                color: snap.source === "claude" ? "#1971c2" : "#7048e8",
              }}
            >
              {snap.source === "claude" ? "Claude" : "You"}
            </span>
          </div>
          <MermaidThumbnail
            mermaid={snap.mermaid}
            id={`${idx}-${snap.timestamp.replace(/[^a-zA-Z0-9]/g, "")}`}
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button
              disabled={restoringTs === snap.timestamp}
              onClick={async () => {
                setRestoringTs(snap.timestamp);
                try {
                  await onRestore(snap.timestamp);
                } finally {
                  setRestoringTs(null);
                }
              }}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                border: "1px solid #dee2e6",
                borderRadius: 4,
                backgroundColor: restoringTs === snap.timestamp ? "#f0f0f0" : "#fff",
                cursor: restoringTs === snap.timestamp ? "default" : "pointer",
                color: "#495057",
                fontFamily: "inherit",
              }}
            >
              {restoringTs === snap.timestamp ? "Restoring..." : "Restore"}
            </button>
            <button
              disabled={deletingTs === snap.timestamp}
              onClick={async () => {
                setDeletingTs(snap.timestamp);
                try {
                  await onDelete(snap.timestamp);
                } finally {
                  setDeletingTs(null);
                }
              }}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                border: "1px solid #dee2e6",
                borderRadius: 4,
                backgroundColor: deletingTs === snap.timestamp ? "#f0f0f0" : "#fff",
                cursor: deletingTs === snap.timestamp ? "default" : "pointer",
                color: "#e03131",
                fontFamily: "inherit",
              }}
            >
              {deletingTs === snap.timestamp ? "..." : "Delete"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
