// The Workflow entrypoint for model-upload.ts — kept alone in this file because it is the only part
// that needs the Workers runtime.
//
// WHY `import * as` AND A FALLBACK BASE. The runtime needs a class that extends
// `WorkflowEntrypoint`; the Node test suites bundle index.ts against several `cloudflare:workers`
// stand-ins that only export `DurableObject`. A named import of a missing export fails the bundle
// of every one of those suites, a namespace property read does not.
import * as workers from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { Env } from './env';
import { runModelUpload, type ModelUploadOutcome, type ModelUploadParams } from './model-upload';

type Base = new (ctx: ExecutionContext, env: Env) => { env: Env };
const WorkflowBase: Base =
  (workers as unknown as { WorkflowEntrypoint?: Base }).WorkflowEntrypoint ??
  class {
    env: Env;
    constructor(_ctx: ExecutionContext, env: Env) {
      this.env = env;
    }
  };

export class ModelUploadWorkflow extends WorkflowBase {
  async run(event: Readonly<WorkflowEvent<ModelUploadParams>>, step: WorkflowStep): Promise<ModelUploadOutcome> {
    return runModelUpload(this.env, event.payload, step);
  }
}

