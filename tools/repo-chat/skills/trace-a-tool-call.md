---
name: trace-a-tool-call
description: Trace how an agent tool call travels from the model, through the tool registry and dispatcher, to a Studio plugin operation and back; also how a new tool is registered.
---
# Trace a tool call (agent tool -> registry -> plugin op)

Use for "how does the agent call a tool", "where is the tool registry", "how do I add a tool".

1. Registry: `search_code` for `export const TOOLS` in `apps/worker/src/tools.ts` and `read_file` the start of that object plus one complete example tool (name, schema or description, implementation). Also find `toolDefs(` (builds the definitions offered to the model) and `runTool(` (the dispatcher). Read both signatures and the lines that look a tool up by name.
2. How the model sees tools: from `toolDefs`, follow to where the gateway call is made (`search_code` "toolDefs(" in `apps/worker/src`), usually the agent loop in `apps/worker/src/do/session.ts` (alarm-driven steps).
3. Dispatch: find the call to `runTool(` in the session DO, and what it does with the result (`toolMutatesProject`, ledger/checkpoint hooks).
4. Studio ops: a tool that touches the place builds a `StudioOp` and queues it on the session DO; search `do/session.ts` for the op queue and the `/api/studio/poll` handler in `apps/worker/src`. The plugin long-polls (`apps/apple-plugin/src/Bridge.luau`, `POLL_URL`) and executes the op in `apps/apple-plugin/src/Commands.luau`, with op families merged from `apps/apple-plugin/src/ops/init.luau` (Query, Physics, Terrain, Rig, Ui, Fx, Content, OwnerCorpus, ...). The result returns to the DO and becomes the tool result.
5. Wire types: `search_code` for `StudioOp` and `OpResult` in `packages/shared/src`.
6. Registering a new tool: describe the steps the code shows (entry in `TOOLS`, definition in `toolDefs`, plugin op family if it needs Studio) and name the tests the plan docs say each tool must satisfy (`search_knowledge` "tests pinned by name new tool", see `docs/autonomy/PHASE-3-4-PLAN.md`). Only list steps you saw in code or docs.
7. Present the answer as a numbered path with `path:line` per hop. If a hop could not be confirmed, mark it "not verified".
