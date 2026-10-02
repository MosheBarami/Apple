// Entry for packages/components/proof/compose-proof.mjs: the composer and the lane-defense reader in one bundle. The proof
// takes the agent's own `laneDefense` argument (a JSON file) and builds the steps it would build.
export * from './compose';
export { readLaneDefense } from './compose-lane';
export { SURFACE_MAPS } from './surfaces';
