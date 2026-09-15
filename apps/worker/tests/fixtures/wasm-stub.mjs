// Stands in for the 2.4 MB resvg WebAssembly module while node runs the rasteriser's PURE
// decisions — what is refused, how currentColor resolves, how an Iconify record becomes a
// document. None of those reach `init()`, so nothing here is ever called.
//
// The stub exists because node cannot load wrangler's compiled-module form of a `.wasm` import:
// left external it resolves to the real file and fails on its own `wbg` import, and the whole
// file then fails to LOAD — one error that reads as seven broken assertions.
//
// THE RENDER ITSELF IS NOT TESTED HERE, and that is stated rather than implied. It is exercised
// against the deployed worker, where the real module is loaded by the real runtime.
export default {};
