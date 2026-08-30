# Meshy 3D Assets on a High-End Marketing Site (Build-Time Pipeline) — 2026 Best Practice

Research date: 2026-08-30. Context: "Golem" landing page — stylized clay/stone/rune golem characters generated in Meshy, used as build-time static assets (no runtime Meshy API calls), rendered with three.js / react-three-fiber, hosted cheaply (Cloudflare Workers static assets / R2). Target: **< 2–3 MB total 3D payload** for the hero.

---

## 1. Meshy export formats and texture options (verified against docs.meshy.ai)

**Export formats** (set via `target_formats` at task-creation time — decide before generating):
`["glb", "fbx", "obj", "usdz", "stl", "3mf"]`. No `.blend` export. For web, **GLB is the only format you want** — single binary, embeds textures, native glTF 2.0.

**Texture options:**
- Base color map always included.
- `enable_pbr: true` adds **metallic, roughness, normal** maps (plus an emission map on Meshy-6 except at 8K; Meshy-7 omits emission).
- `texture_resolution`: `"2k"` (2048², default), `"4k"`, `"8k"`.

**Geometry/topology controls (the important knobs for web budgets):**
- `ai_model`: `meshy-5`, `meshy-6`, `meshy-7`, `latest`.
- `topology`: `"quad"` or `"triangle"`.
- `target_polycount`: **100–300,000 faces** (standard remesh) or **100–15,000 faces** with `smart-topology` model type.
- `should_remesh: true/false`; `decimation_mode` 1–4 (ultra/high/medium/low adaptive decimation).

**Recommended Meshy settings for a landing-hero golem:**
- GLB + `enable_pbr: true`, `texture_resolution: "2k"` (2K is plenty after KTX2 compression; 4K/8K only bloats and gets downscaled anyway).
- `topology: "triangle"`, `target_polycount` ≈ **15,000–30,000** per character. A hero character does not need more; you will simplify further in the pipeline if needed.
- Local Meshy MCP note: this machine has a Meshy MCP server; per its cost table, text-to-3d costs 5–20 credits, refine 10 (15 at 8K), remesh 5, convert 1 — relevant only at build time, zero runtime cost.

Raw Meshy GLB output size for a character at those settings is typically in the ~5–25 MB range depending on polycount/texture res (UNVERIFIED exact numbers — varies per asset; always inspect with `gltf-transform inspect`). This is why the compression step below is mandatory.

---

## 2. Compression pipeline: GLB → optimized GLB (build-time, in CI or a package.json script)

Two equivalent toolchains; pick one (both verified):

### Option A — `@gltf-transform/cli` (v4.4.2, `npm i -g @gltf-transform/cli`) — most control
```bash
# One-shot:
gltf-transform optimize golem-raw.glb golem.glb \
  --compress meshopt \
  --texture-compress ktx2 \
  --texture-size 1024

# Or staged, with per-texture-type codecs (best quality/size):
gltf-transform resize golem-raw.glb tmp.glb --width 1024 --height 1024
gltf-transform etc1s tmp.glb tmp.glb --slots "baseColorTexture"      # color data → ETC1S (small)
gltf-transform uastc tmp.glb tmp.glb --slots "{normalTexture,metallicRoughnessTexture,occlusionTexture}"  # data maps → UASTC (quality)
gltf-transform simplify tmp.glb tmp.glb --ratio 0.75 --error 0.001   # optional polycount trim
gltf-transform meshopt tmp.glb golem.glb                              # EXT_meshopt_compression
```
Key rule (verified via glTF-Transform discussions + Khronos KHR_texture_basisu docs): **ETC1S for base color, UASTC for normal/ORM maps** — ETC1S visibly degrades normal maps.

### Option B — `gltfpack` (npm package `gltfpack`, from meshoptimizer) — fastest single command
```bash
gltfpack -i golem-raw.glb -o golem.glb -cc -tc -si 0.75
```
- `-c` / `-cc` → `EXT_meshopt_compression` (cc = extra compression); quantization via `KHR_mesh_quantization` is on by default.
- `-tc` → KTX2/BasisU textures (`KHR_texture_basisu`); `-tw` → WebP textures instead.
- `-si R` (0–1) → mesh simplification; `-kn`/`-km` keep named nodes/materials (needed if you animate parts by name).
- Requires three.js **r122+** for decode support.

### Draco vs meshopt (2026 verdict: prefer meshopt for this use case)
- **Draco** compresses geometry hardest, but its decoder is ~**100 KB gzipped WASM** (verified via google/draco / mrdoob draco.js notes; a pure-JS alt is ~20 KB gzipped) and decode is CPU-heavier.
- **meshopt** compresses slightly less but the decoder is tiny and decode is near-instant; it also compresses animations and plays perfectly with quantization. For a single hero model where total-page-weight and TTI matter, **meshopt + KTX2 is the 2026 default**; use Draco only if you're shipping many large static meshes and geometry dominates.
- KTX2/BasisU textures stay compressed **on the GPU** (transcoded to the native GPU format), cutting GPU memory ~4–8× vs PNG/JPEG textures — matters on mobile. Khronos sample-model data showed a 43.06 MB → 29.37 MB reduction from texture compression alone on FlightHelmet; stylized low-texture-count assets compress far better proportionally.

### Realistic size budget for the hero (<2–3 MB total 3D payload)
| Item | Budget |
|---|---|
| Golem GLB (20–30k tris, meshopt + KTX2, 1K textures) | 0.6–1.5 MB |
| HDRI environment (1K .hdr, or gainmap .webp) | 0.3–0.8 MB (gainmap webp ≈ 100–300 KB) |
| Basis/KTX2 transcoder (wasm+js, lazy-loaded) | ~0.5 MB (UNVERIFIED exact; lazy-load it) |
| meshopt decoder | tens of KB (small; UNVERIFIED exact) |
| three.js core (tree-shaken, gzipped) | ~150–170 KB gz (UNVERIFIED exact for r18x) |
Verify every build with `gltf-transform inspect golem.glb` and a CI size gate (fail the build if `golem.glb` > 1.5 MB).

---

## 3. Loading in three.js / react-three-fiber (verified against threejs.org + drei docs)

**Plain three.js decoder wiring:**
```js
const loader = new GLTFLoader();
// Draco (only if you chose draco):
const draco = new DRACOLoader();
draco.setDecoderPath('/draco/');            // files from three/examples/jsm/libs/draco/
loader.setDRACOLoader(draco);
// KTX2:
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
loader.setKTX2Loader(ktx2);
// meshopt:
await MeshoptDecoder.ready;                  // three/examples/jsm/libs/meshopt_decoder.module.js
loader.setMeshoptDecoder(MeshoptDecoder);
```
Self-host the decoder folders (`examples/jsm/libs/draco/`, `examples/jsm/libs/basis/`) — don't rely on unpkg/gstatic CDNs in production.

**react-three-fiber / drei:**
- `const { nodes, materials } = useGLTF('/golem.glb')` — drei auto-wires DRACOLoader (defaults to `https://www.gstatic.com/draco/v1/decoders/` CDN; override with `useGLTF.setDecoderPath('/draco/')`) and supports meshopt out of the box. For KTX2, use the `extendLoader` callback: `useGLTF(url, true, true, (l) => l.setKTX2Loader(ktx2.detectSupport(gl)))`.
- `useGLTF.preload('/golem.glb')` at module scope to start the fetch before the component mounts.
- `useLoader`/`useGLTF` results are cached automatically per-URL.

**Suspense + lazy pattern (the 2026 idiom):**
```jsx
const Scene = lazy(() => import('./GolemScene'));   // code-split three.js itself
...
<Suspense fallback={<PosterImage />}>              {/* static webp/avif render of the golem */}
  <Scene />
</Suspense>
```
Inside the Canvas, wrap the model in `<Suspense fallback={null}>` and show a DOM poster/skeleton outside the canvas until loaded. Render the poster image server-side (Astro static HTML) so LCP is an `<img>`, never the WebGL canvas.

---

## 4. Lighting/environment (HDRI) for stylized clay/stone/rune golems

- Use **image-based lighting**: drei `<Environment files="/env-1k.hdr" />` (props verified: `files` accepts `.hdr`, `.exr`, gainmap `.jpg`/`.webp`; `environmentIntensity`, `background`, `resolution`). **Do not use `preset="studio"` etc. in production** — drei docs explicitly warn presets rely on CDNs and may fail; self-host via `@pmndrs/assets` or your own 1K HDRI (Poly Haven, CC0).
- Gainmap `.webp`/`.jpg` environments are the 2026 size win: HDR-quality env lighting at ~10–20% of `.hdr` size.
- Stylized clay/stone reads best with: soft studio-ish HDRI at low `environmentIntensity` (0.6–1.0) + **one warm key `directionalLight`** for shape + a cool rim light for the "rune glow" silhouette; roughness 0.7–0.95, metalness 0; add subtle **emissive** on rune carvings (or a separate emissive mesh + bloom postprocess sparingly).
- Bake/keep AO from Meshy's PBR set; ambient occlusion carries most of the "carved stone" feel at zero runtime cost.
- `ContactShadows` (drei) instead of real shadow maps — far cheaper, looks premium.
- Set `renderer.toneMapping = ACESFilmicToneMapping` (three default pipeline) and keep the canvas transparent over your page gradient rather than rendering a 3D background.

---

## 5. Fallbacks: reduced-motion / low-power devices

- **`prefers-reduced-motion: reduce`** (matchMedia): don't autoplay turntable/scroll animation — render one static frame (R3F `frameloop="demand"`, verified) or skip WebGL entirely and show the poster image. Also gate GSAP/Lenis effects with `gsap.matchMedia()`.
- **On-demand rendering**: `<Canvas frameloop="demand">` + `invalidate()` only when the user interacts/scrolls — verified R3F pattern; idle hero costs ~0 GPU/battery.
- **Adaptive quality**: drei `<PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(2)}>` and clamp `dpr={[1, 2]}` on Canvas (verified). Optionally `AdaptiveDpr` + movement regression via `state.performance`.
- **Capability gating before loading anything 3D**: check `matchMedia('(prefers-reduced-motion: reduce)')`, WebGL2 support, and heuristics like `navigator.hardwareConcurrency <= 4` / `navigator.deviceMemory <= 4` (deviceMemory is Chromium-only — treat as hint, UNVERIFIED coverage) / `(prefers-reduced-data)`. If any fail → keep the static poster; the 3D bundle never downloads. This is free on Astro because the island only hydrates conditionally.
- Always ship the poster `<img>` first regardless — it's your LCP and your no-JS/no-WebGL fallback.

---

## 6. Astro integration for a three.js hero island

- Astro islands ship **zero JS by default**; hydrate the hero with a `client:*` directive (verified): `client:load` (immediately), `client:idle` (browser idle), `client:visible` (enters viewport), plus `client:media` and `client:only`.
- For an above-the-fold 3D hero: **`client:only="react"` + `client:idle`-like deferral is the usual choice** — three.js components can't meaningfully SSR, so `client:only="react"` skips server render; pair with the static poster in the `.astro` file for instant paint. For a below-the-fold 3D section, `client:visible` is strictly better.
- Options ranked for Golem:
  1. **React island with @react-three/fiber + drei** (`@astrojs/react`) — best DX, use `client:only="react"`. Only the island pays the React+three cost.
  2. **Vanilla three.js in a `<script>` module** — smallest possible JS (no React in the island), ideal if the hero is one model + orbit/idle rotation. Dynamic-`import('three')` inside an IntersectionObserver/idle callback.
  3. `<model-viewer>` web component — trivial GLB display with built-in lazy load/AR, but generic-looking; not "award-level."
- Serve `.glb`, `.hdr`, decoder wasm from `public/` with long-cache immutable headers (Cloudflare static assets/R2 — effectively $0 at this scale).

---

## 7. What makes 2025/2026 award-level landing pages feel premium

Stack observed across Awwwards SOTD writeups: **Lenis (smooth scroll) + GSAP ScrollTrigger (scroll choreography) + three.js (WebGL hero) + Motion for component-level animation**; WebGL heroes are now table stakes on premium projects, and CSS `view-timeline`/scroll-driven animations handle simple cases without JS.

Four concrete reference techniques:
1. **Scroll choreography / scrollytelling**: pin the hero (`ScrollTrigger` pin + scrub) and drive the golem's rotation/camera dolly and staggered text reveals from scroll progress — map `scrollProgress` → camera position + `material.emissiveIntensity` (runes ignite as you scroll). Lenis provides the inertial scroll feel that reads as "expensive."
2. **Shader/mesh gradients + grain**: animated GLSL mesh-gradient background (or a tiny fragment-shader plane behind the golem) + a film-grain/noise overlay at ~3–5% opacity — kills flat-gradient banding and is the single cheapest "premium" signal.
3. **Choreographed entrance sequences**: multi-element staggered reveals — split text (per-line mask reveals with `clip-path`/overflow clip), the 3D model easing in with slight overshoot, custom easing curves (`expo.out`, ~0.8–1.2 s) — everything on one timeline, nothing animating independently.
4. **Micro-interaction depth**: cursor-parallax on the golem (pointer → subtle model tilt, lerped), magnetic buttons, hover-state light response (pointer moves a point light so the stone reacts). Bound by `prefers-reduced-motion`.

---

## Recommended pipeline for Golem (summary)

1. Meshy text-to-3d (`meshy-7`/`latest`) → refine with `enable_pbr: true`, `texture_resolution: "2k"`, `topology: "triangle"`, `target_polycount: ~20000`, `target_formats: ["glb"]`.
2. Build script: `gltfpack -i raw.glb -o public/models/golem.glb -cc -tc` (or gltf-transform staged ETC1S/UASTC). CI gate: fail if > 1.5 MB.
3. Render a static poster (webp/avif) of the final lit model for LCP + fallback.
4. Astro page: static HTML + poster; React island `client:only="react"`, gated on reduced-motion/WebGL2/core-count; `<Canvas frameloop="demand" dpr={[1,2]}>`, `useGLTF` with self-hosted meshopt+KTX2 decoders, `<Environment files>` with self-hosted 1K gainmap env, ContactShadows, one key light + rim.
5. Lenis + GSAP ScrollTrigger scroll choreography, grain overlay, shader gradient backdrop; all motion behind `gsap.matchMedia()` reduced-motion guards.

---

## Sources

- Meshy Text-to-3D API docs (formats, PBR, polycount, params): https://docs.meshy.ai/en/api/text-to-3d
- glTF Transform CLI (v4.4.2, optimize/compress/texture flags): https://gltf-transform.dev/cli
- gltfpack / meshoptimizer glTF docs (flags, EXT_meshopt_compression, three.js decode): https://meshoptimizer.org/gltf/
- three.js GLTFLoader docs (DRACOLoader/KTX2Loader/MeshoptDecoder wiring): https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- drei useGLTF (preload, draco CDN default, extendLoader/KTX2): https://drei.docs.pmnd.rs/loaders/gltf-use-gltf
- drei Environment (files/presets/production CDN warning): https://drei.docs.pmnd.rs/staging/environment
- R3F scaling performance (frameloop="demand", invalidate, PerformanceMonitor): https://r3f.docs.pmnd.rs/advanced/scaling-performance
- Astro islands & client directives: https://docs.astro.build/en/concepts/islands/
- ETC1S vs UASTC per-texture-type guidance: https://github.com/donmccurdy/glTF-Transform/discussions/625 and https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md
- KTX2 size example (FlightHelmet 43.06→29.37 MB): https://deepwiki.com/KhronosGroup/glTF-Sample-Models/5.1-texture-compression-with-ktx2-and-basis-universal
- Draco decoder size (~100 KB gz wasm; ~20 KB gz pure-JS alt): https://github.com/mrdoob/draco.js and https://github.com/google/draco
- 2025/2026 premium landing techniques (Lenis+GSAP+three stack, scrollytelling): https://svilenkovic.com/3d/scrollytelling-trends-2026 , https://www.edoardolunardi.dev/blog/building-smooth-scroll-in-2025-with-lenis , https://medium.com/design-bootcamp/awwward-winning-animation-techniques-for-websites-cb7c6b5a86ff , https://dev.to/robinzon100/build-an-award-winning-3d-website-with-scroll-based-animations-nextjs-threejs-gsap-3630
