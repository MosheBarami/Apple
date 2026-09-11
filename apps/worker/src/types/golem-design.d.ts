// Types for @golem/design, declared HERE rather than in that package.
//
// The design library is plain ESM with JSDoc and no build step, which is right for it —
// it is data plus two pure functions and adding a compile step would be the tail wagging
// the dog. The worker is TypeScript, so it needs a declaration, and this is the honest
// place for it: the worker is the consumer that requires types, and a `.d.ts` written by
// the consumer cannot silently drift into being treated as the source of truth.
declare module '@golem/design' {
  export interface DesignRule {
    id: string;
    component: string;
    styleFamilies: string[];
    platforms?: string[];
    rule: string;
    because: string;
    prevents: string;
    provenance: { kind: string; source: string; validated?: string };
    tokens?: Record<string, string | number>;
  }
  export interface DesignBriefInput {
    component?: string;
    styleFamily?: string;
    platform?: string;
    need?: string;
  }
  export const RULES: ReadonlyArray<DesignRule>;
  export const COMPONENTS: ReadonlyArray<string>;
  export const STYLE_FAMILIES: ReadonlyArray<string>;
  export function retrieve(
    brief: DesignBriefInput,
    options?: { rules?: ReadonlyArray<DesignRule>; limit?: number; minPoints?: number },
  ): Array<{ rule: DesignRule; points: number; why: string[] }>;
  export function composeBrief(
    brief: DesignBriefInput,
    options?: { rules?: ReadonlyArray<DesignRule>; limit?: number; minPoints?: number },
  ): { text: string; used: string[]; count: number };
  export function coverage(options?: { rules?: ReadonlyArray<DesignRule> }): {
    byComponent: Record<string, number>;
    byFamily: Record<string, number>;
    uncovered: { components: string[]; styleFamilies: string[] };
    total: number;
  };
}
