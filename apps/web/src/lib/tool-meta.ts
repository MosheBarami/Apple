// What each agent tool *means* to a person watching.
//
// This file used to hold a FOURTH copy of the tool table — its own labels
// ("Reading the place" where the activity card said "Read the project tree"), its own
// five-stage vocabulary, and a `touchesStudio` flag. It had drifted further than any of
// the others: three of its twenty entries were tools that do not exist
// (`get_instance`, `get_selection`, `move_instances`) and seven real tools were absent,
// so a work-surface panel from `generate_model` fell through to the label "Working".
//
// Only ONE thing in it was ever rendered: `toolMeta(tool).label`, at panels.ts. The
// stage vocabulary, `STAGE_LABEL`, `touchesStudio` and `runPhase` had no consumer at
// all. So it was deleted rather than synchronised — a fourth table kept in step is
// still a fourth table — and the label now comes from `ws/tool-vocabulary.ts`, which is
// checked against the worker's registry in both directions.
//
// What remains is the one thing that was never a duplicate: the loading sequences.

/** Loading sequences differ per operation — see components/loading.tsx. */
export type OperationKind = 'building' | 'verifying' | 'rendering' | 'restoring' | 'connecting' | 'recalling';

export const OPERATION_STEPS: Record<OperationKind, string[]> = {
  building: ['Reading the place', 'Writing the changes', 'Applying in Studio', 'Checking the result'],
  verifying: ['Running the place', 'Reading the output', 'Judging what changed'],
  rendering: ['Framing the camera', 'Rasterising the scene', 'Packing the pixels', 'Grading the composition'],
  restoring: ['Loading the snapshot', 'Rewinding the place', 'Re-linking scripts'],
  connecting: ['Minting a pairing code', 'Waiting for Studio', 'Handshaking'],
  recalling: ['Opening the session', 'Recalling the conversation', 'Loading checkpoints'],
};
