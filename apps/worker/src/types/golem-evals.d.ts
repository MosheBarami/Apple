// Types for the Luau intelligence cluster in `packages/evals/src`, declared HERE.
//
// Same seam, and the same reasoning, as golem-design.d.ts: that package is plain ESM with JSDoc
// and no build step, the worker is TypeScript, and the consumer that needs types is the honest
// place to write them. These declarations are deliberately NARROWER than the modules — they cover
// only what `luau-review.ts` uses, so a field appearing here is one the product actually reads.

declare module '@golem/evals/src/luau-ast.mjs' {
  export interface LuauParseError {
    message: string;
    line: number;
    column: number;
    index?: number;
  }
  export interface LuauParse {
    ok: boolean;
    ast: Record<string, unknown> | null;
    errors: LuauParseError[];
    text: string;
  }
  export function parseLuau(source: string, opts?: { path?: string }): LuauParse;
}

declare module '@golem/evals/src/luau-symbols.mjs' {
  export interface LuauSymbol {
    id: number;
    name: string;
    kind: string;
    line: number;
    column: number;
    reads: number;
    writes: number;
    references: { line: number; column: number; kind: string }[];
  }
  export interface SymbolTable {
    ok: boolean;
    symbols: LuauSymbol[];
    references: { name: string; line: number; column: number; kind: string; symbolId: number | null }[];
  }
  export interface CrossReference {
    symbol: LuauSymbol;
    definition: { line: number; column: number; kind: string };
    references: { line: number; column: number; kind: string }[];
    reads: number;
    writes: number;
  }
  export function buildSymbolTable(input: string | unknown, opts?: Record<string, unknown>): SymbolTable;
  export function searchSymbols(table: SymbolTable, query: string, opts?: { kinds?: string[] }): LuauSymbol[];
  export function symbolAt(table: SymbolTable, line: number, column: number): LuauSymbol | null;
  export function crossReference(table: SymbolTable, line: number, column: number): CrossReference | null;
}

declare module '@golem/evals/src/luau-graph.mjs' {
  export interface DependencyGraph {
    nodes: { path: string; requires: string[]; ok: boolean }[];
    edges: { from: string; to: string; line: number }[];
    unresolved: { from: string; line: number; expression: string; resolved: string | null }[];
    cycles: string[][];
    roots: string[];
    leaves: string[];
  }
  export interface PlaceDefinition {
    path: string;
    name: string;
    kind: string;
    line: number;
    endLine: number;
  }
  export function buildDependencyGraph(
    files: { path: string; source: string }[],
    opts?: Record<string, unknown>,
  ): DependencyGraph;
  export function requireOrder(graph: DependencyGraph): string[] | null;
  export function indexPlace(files: { path: string; source: string }[]): PlaceDefinition[];
}

declare module '@golem/evals/src/luau-format.mjs' {
  export function formatLuau(
    source: string,
    opts?: { indent?: string; maxBlankLines?: number },
  ): { code: string; changed: boolean; ok: boolean; errors: { line: number; column: number; message: string }[] };
  export function tokenDrift(
    before: string,
    after: string,
  ): { index: number; before: unknown; after: unknown; reason: string } | null;
}

declare module '@golem/evals/src/luau-intel.mjs' {
  export interface LuauFinding {
    rule: string;
    severity: 'error' | 'warn' | 'info' | string;
    line: number;
    column?: number;
    detail: string;
    why?: string;
  }
  export interface FileAnalysis {
    path: string | null;
    ok: boolean;
    context: string;
    isTest: boolean;
    findings: LuauFinding[];
    errorCount: number;
    warnCount: number;
    requires: { path: string | null; line: number; expression: string }[];
  }
  export interface PlaceAnalysis {
    files: FileAnalysis[];
    dependencies: import('@golem/evals/src/luau-graph.mjs').DependencyGraph;
    symbols: import('@golem/evals/src/luau-graph.mjs').PlaceDefinition[];
    findings: (LuauFinding & { path: string })[];
    totals: {
      scripts: number;
      parsed: number;
      errors: number;
      warnings: number;
      requireCycles: number;
    };
  }
  export function analyzeFile(
    source: string,
    opts?: { path?: string; context?: string; rules?: string[]; includeShadowing?: boolean },
  ): FileAnalysis;
  export function analyzePlace(
    files: { path: string; source: string }[],
    opts?: Record<string, unknown>,
  ): PlaceAnalysis;
}

declare module '@golem/evals/src/roblox-antipatterns.mjs' {
  export function inferContext(source: string): string;
  export function stripComments(source: string): string;
}
