// Wrangler serves a `.wasm` import as a compiled WebAssembly.Module, which is what
// `initWasm` expects. TypeScript has no built-in shape for it, so the declaration says so here
// rather than at each import with a cast that would hide a real mismatch.
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
