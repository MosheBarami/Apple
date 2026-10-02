// D-MODELLIB-2, restated in phase 1 (2026-10-02): the library is PREFERRED, never forced.
//
// Owner order (2026-09-24): "NEVER generate from scratch models and 3d ... Search the library for the perfect model/kit
// instead." What stays closed is the AI 3D GENERATOR (generate_model, generate_model_external): Apple does not make a
// model with one. What is no longer a refusal is the agent building a thing from parts when the library has nothing that
// is it: that used to be decided by a list of nouns (a tree, a lamp, a chest, a pet...) matched against names in
// create_instances and run_luau, which refused a part for being called "Chest" whatever it was for, and told every
// object-shaped request to build with one tool or search with another. The agent chooses now (search the library,
// preview, place, compose, or build_object) and create_instances says what the library holds when a Model of parts is
// named like a row (model-library.ts libraryAdvice): information, not a block.

export const MODEL_DECISION = 'D-MODELLIB-2';

export interface ModelRefusal {
  error: string;
  refused: string[];
}

/** The AI 3D generators are closed to the agent: a 3D model comes from the library or from parts the agent places. */
export function refuseGeneratedModel(tool: string): ModelRefusal {
  return {
    error: `Refused (${MODEL_DECISION}): Apple does not use an AI 3D generator (${tool}). Search the library (find_library_model, browse_owner_library), preview and place a ready-made model (preview_library_models, insert_library_model), or build it from parts with build_object. Nothing was sent to Studio.`,
    refused: [`${tool} generates a 3D model from scratch`],
  };
}
