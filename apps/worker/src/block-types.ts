/** The shape of one compiled block (packages/blocks/README.md; compiled by scripts/gen-blocks.mjs). */
export interface ParamSchema {
  /** `object` only as the items of a list: one entry of a list a block repeats (`each`). */
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: ParamSchema;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, ParamSchema>;
  required?: string[];
  additionalProperties?: false;
  default?: unknown;
  description?: string;
}

export interface BlockContract {
  id: string;
  kind: 'ui' | 'system' | 'prop' | 'zone' | 'fx' | 'lighting';
  summary: string;
  params: { type: 'object'; additionalProperties: false; properties: Record<string, ParamSchema> };
  provides: string[];
  depends: string[];
}

export type RecipeStep =
  | { id: string; op: 'create_instances'; items: unknown[] }
  | { id: string; op: 'set_props'; path: string; props: Record<string, unknown> }
  | { id: string; op: 'edit_script'; path: string; file: string; create: { className: 'Script' | 'LocalScript' | 'ModuleScript'; parent: string } }
  | { id: string; op: 'clone_instances'; paths: string[]; parent?: string };

export type BlockCheck = { id: string; describes: string; after?: string; param?: string } & (
  | { kind: 'exists'; path: string }
  | { kind: 'prop'; path: string; prop: string; equals: unknown }
  | { kind: 'script_has'; path: string; contains: string }
  | { kind: 'play_clean' }
);

export interface Block {
  block: BlockContract;
  recipe: { steps: RecipeStep[] };
  checks: BlockCheck[];
  hint: string;
  sources: Record<string, string>;
}
