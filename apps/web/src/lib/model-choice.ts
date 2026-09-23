/**
 * THE LAST MODEL A PERSON CHOSE, remembered on this device per account (D-VISION-1).
 *
 * A convenience, never an entitlement: what is read back is only ever a registry id, and the
 * workspace passes it through `bestEntitledModel` with the account's current plan, so a choice made
 * on a plan that has since lapsed falls back to the best model the account may still use. The worker
 * checks the model again at admission and at every step, whatever this says.
 *
 * `localStorage` throws in a private window and in some embedded webviews; both functions swallow
 * that, because a remembered preference must never be able to stop a send or the page rendering.
 */
import { isModelId, type ModelId } from '@golem/shared';

const keyFor = (userId: string) => `apple.model.${userId}`;

export function readModelChoice(userId: string): ModelId | null {
  if (!userId) return null;
  try {
    const value = window.localStorage.getItem(keyFor(userId));
    return isModelId(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveModelChoice(userId: string, model: ModelId): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(keyFor(userId), model);
  } catch {
    // Not remembered on this device; the choice still stands for this page.
  }
}
