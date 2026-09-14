// Ambient types for `@golem/design/pixels`, which is plain .mjs.
//
// Same pattern as golem-design.d.ts: the package ships JavaScript, the worker is TypeScript, and
// this file is the seam. It must stay in step with src/pixels.mjs by hand — which is exactly the
// kind of drift that produced OH-6, so the conformance test asserts the two agree.
declare module '@golem/design/pixels' {
  export const SKY_RGB: readonly [number, number, number];
  export const GROUND_RGB: readonly [number, number, number];
  export function geometryMask(rgb: Uint8Array, width: number, height: number): Uint8Array;
}
