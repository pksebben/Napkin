export const HIGHLIGHT_COLORS = {
  blue:   { fill: "#d0ebff", stroke: "#1971c2", label: "Discussing" },
  yellow: { fill: "#fff3bf", stroke: "#fab005", label: "New/Changed" },
  red:    { fill: "#ffe0e0", stroke: "#e03131", label: "Problem" },
  green:  { fill: "#d3f9d8", stroke: "#2f9e44", label: "Approved" },
} as const;

export type HighlightColorName = keyof typeof HIGHLIGHT_COLORS;
