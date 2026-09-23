// FINISHING A 3D MODEL UPLOAD AFTER THE AGENT HAS MOVED ON — a Cloudflare Workflow (D-VISION-1).
//
// `generateModelForRoblox` (hf-3d-pipeline.ts) generates a mesh, uploads it into the customer's own
// Roblox account and polls the upload for ten seconds. When Roblox is slower than that, the tool
// answers "still processing" with an operation id — and until now nothing ever asked again, so the
// customer had a Model somewhere in their inventory and no way to know it had arrived or what its
// id was.
//
// This Workflow is that "ask again", made durable: it polls the operation with growing sleeps for
// up to about half an hour, survives deploys and isolate restarts (each check is a persisted step),
// and when Roblox answers it drops a notification on the project saying the model is ready and
// what its asset id is. It spends nothing: the mesh was generated and uploaded before it starts.
//
// The Workflow class itself is in model-upload-workflow.ts; this file holds everything that can run
// (and be tested) without the Workers runtime, so hf-3d-pipeline.ts can import it in plain Node.
import type { WorkflowStep } from 'cloudflare:workers';
import type { Env } from './env';
import { getUploadStatus, type CreatorEnv, type Result, type UploadedAsset } from './creator-dashboard';
import { notify } from './notify';

export interface ModelUploadParams {
  userId: string;
  operationId: string;
  projectId: string | null;
  displayName: string;
}

export type ModelUploadOutcome =
  | { done: true; assetId: number; notified: boolean }
  | { done: false; reason: 'gave_up' | 'refused'; message?: string };

/** Sleeps between checks. Sum ≈ 31 minutes; Roblox normally finishes in well under one. */
export const CHECK_DELAYS_SECONDS = [15, 30, 60, 120, 300, 600, 720] as const;

/** Instance id for one operation, so a repeated start for the same upload is refused, not doubled. */
export function instanceIdFor(operationId: string): string {
  return `upload-${operationId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 100);
}

export interface ModelUploadDeps {
  status?: (env: CreatorEnv, userId: string, operationId: string) => Promise<Result<UploadedAsset>>;
  notify?: typeof notify;
}

/** The steps, apart from the runtime, so a test can drive them with a fake `step`. */
export async function runModelUpload(
  env: Env,
  params: ModelUploadParams,
  step: Pick<WorkflowStep, 'do' | 'sleep'>,
  deps: ModelUploadDeps = {},
): Promise<ModelUploadOutcome> {
  const status = deps.status ?? ((e, u, id) => getUploadStatus(e, u, id));
  const send = deps.notify ?? notify;

  for (let i = 0; i <= CHECK_DELAYS_SECONDS.length; i++) {
    const check = await step.do(`check ${i}`, { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' } }, async () => {
      const r = await status(env, params.userId, params.operationId);
      // A refusal (key removed, scope gone) is an answer, not a transient: stop, do not retry.
      if (!r.ok) return { state: 'refused' as const, message: r.error };
      return r.data.done && typeof r.data.assetId === 'number'
        ? { state: 'done' as const, assetId: r.data.assetId }
        : { state: 'pending' as const };
    });
    if (check.state === 'refused') return { done: false, reason: 'refused', message: check.message };
    if (check.state === 'done') {
      const assetId = check.assetId;
      const notified = await step.do('notify', async () => {
        const out = await send(env, {
          kind: 'run_complete',
          recipientId: params.userId,
          projectId: params.projectId,
          subject: params.operationId,
          title: `Your 3D model "${params.displayName}" is ready in Roblox`,
          body: `It is in your Roblox inventory as asset ${assetId}. Ask Apple to "insert asset ${assetId}" to put it in your place.`,
          at: Date.now(),
        });
        return out.delivered;
      });
      return { done: true, assetId, notified };
    }
    const wait = CHECK_DELAYS_SECONDS[i];
    if (wait === undefined) break;
    await step.sleep(`wait ${i}`, `${wait} seconds`);
  }
  return { done: false, reason: 'gave_up' };
}

/**
 * Start the follow-up. Returns whether one is now running. Never throws: this is called from a
 * tool result path, and a follow-up that cannot start must not turn a successful upload into an error.
 */
export async function startModelUploadFollowUp(
  env: { MODEL_UPLOAD_WORKFLOW?: Workflow<ModelUploadParams> },
  params: ModelUploadParams,
): Promise<boolean> {
  const wf = env.MODEL_UPLOAD_WORKFLOW;
  if (!wf) return false;
  try {
    await wf.create({ id: instanceIdFor(params.operationId), params });
    return true;
  } catch {
    return false;
  }
}
