import { parse, MermaidParseError } from "@mermaid-js/parser";

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Diagram types that @mermaid-js/parser can validate with its Langium grammar.
 * For these types, we get full AST-level validation.
 */
const PARSER_SUPPORTED_TYPES = [
  "info",
  "packet",
  "pie",
  "architecture",
  "gitGraph",
  "radar",
  "treemap",
] as const;

type ParserSupportedType = (typeof PARSER_SUPPORTED_TYPES)[number];

/**
 * All known mermaid diagram type keywords (including aliases).
 * Used for basic structural validation of diagram types that
 * @mermaid-js/parser does not yet support (e.g., flowchart, sequenceDiagram).
 */
const KNOWN_DIAGRAM_KEYWORDS = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Deployment",
  "mindmap",
  "timeline",
  "zenuml",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "packet-beta",
  "kanban",
  "architecture-beta",
  "info",
  "packet",
  "architecture",
  "radar",
  "treemap",
];

/**
 * Extract the diagram type keyword from the first non-empty, non-comment line.
 */
function extractDiagramType(input: string): string | null {
  const lines = input.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("%%")) continue;
    // The first significant token on the first meaningful line is the diagram type.
    // It may be followed by direction or other options (e.g., "flowchart TD").
    const match = trimmed.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Map a diagram keyword to its @mermaid-js/parser type name, if supported.
 */
function toParserType(keyword: string): ParserSupportedType | null {
  const map: Record<string, ParserSupportedType> = {
    info: "info",
    packet: "packet",
    "packet-beta": "packet",
    pie: "pie",
    architecture: "architecture",
    "architecture-beta": "architecture",
    gitGraph: "gitGraph",
    radar: "radar",
    treemap: "treemap",
  };
  return map[keyword] ?? null;
}

/**
 * Validate a mermaid diagram string.
 *
 * - For diagram types supported by @mermaid-js/parser, performs full AST validation.
 * - For other known diagram types (flowchart, sequenceDiagram, etc.), performs
 *   structural validation (checks the diagram type keyword is recognized).
 * - Rejects empty input and unrecognized diagram types.
 */
export async function validateMermaid(
  input: string
): Promise<ValidationResult> {
  // Reject empty / whitespace-only input
  if (!input || input.trim().length === 0) {
    return { valid: false, errors: ["Input is empty"] };
  }

  const diagramType = extractDiagramType(input);
  if (!diagramType) {
    return {
      valid: false,
      errors: ["Could not determine diagram type from input"],
    };
  }

  // Check if this is a known diagram type at all
  if (!KNOWN_DIAGRAM_KEYWORDS.includes(diagramType)) {
    return {
      valid: false,
      errors: [`Unrecognized diagram type: "${diagramType}"`],
    };
  }

  // For parser-supported types, do full validation
  const parserType = toParserType(diagramType);
  if (parserType) {
    try {
      await parse(parserType as any, input);
      return { valid: true };
    } catch (err: unknown) {
      if (err instanceof MermaidParseError) {
        const lexerErrors =
          err.result.lexerErrors?.map((e) => e.message) ?? [];
        const parserErrors =
          err.result.parserErrors?.map((e) => e.message) ?? [];
        const allErrors = [...lexerErrors, ...parserErrors].filter(Boolean);
        return {
          valid: false,
          errors:
            allErrors.length > 0 ? allErrors : [err.message ?? "Parse error"],
        };
      }
      return {
        valid: false,
        errors: [
          err instanceof Error ? err.message : "Unknown validation error",
        ],
      };
    }
  }

  // For known but parser-unsupported types (flowchart, sequenceDiagram, etc.),
  // accept them — the diagram keyword is recognized, and deeper validation
  // will happen when mermaid renders the diagram.
  return { valid: true };
}
