// GENERATED from a read of https://openrouter.ai/api/v1/models on 2026-09-23 (01:20Z). Do not edit
// by hand: it is the FALLBACK for model-catalogue.ts when the live read fails, and the source the
// curated paid list takes its labels from, so that no model id or name in this worker is invented.
// A row here is a fact about that morning, not about today — which is why the catalogue labels the
// free list with when it was read and prefers the live answer whenever it has one.
export const OPENROUTER_SNAPSHOT_READ_AT = "2026-09-23T01:20:00.000Z";

export interface SnapshotModel {
  id: string;
  name: string;
  free: boolean;
  tools: boolean;
}

export const OPENROUTER_SNAPSHOT: readonly SnapshotModel[] = [
  { id: "openai/gpt-6-astra", name: "OpenAI: GPT-6 Astra", free: false, tools: true },
  { id: "openai/gpt-6-astra-pro", name: "OpenAI: GPT-6 Astra Pro", free: false, tools: true },
  { id: "openai/gpt-6-sol", name: "OpenAI: GPT-6 Sol", free: false, tools: true },
  { id: "openai/gpt-6-sol-pro", name: "OpenAI: GPT-6 Sol Pro", free: false, tools: true },
  { id: "openai/gpt-6-luna", name: "OpenAI: GPT-6 Luna", free: false, tools: true },
  { id: "openai/gpt-6-luna-pro", name: "OpenAI: GPT-6 Luna Pro", free: false, tools: true },
  { id: "anthropic/claude-fable-5.1", name: "Anthropic: Claude Fable 5.1", free: false, tools: true },
  { id: "anthropic/claude-opus-5.5", name: "Anthropic: Claude Opus 5.5", free: false, tools: true },
  { id: "google/gemini-3.8-flash", name: "Google: Gemini 3.8 Flash", free: false, tools: true },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek: DeepSeek V4.1 Flash", free: false, tools: true },
  { id: "x-ai/grok-4.7", name: "SpaceXAI: Grok 4.7", free: false, tools: true },
  { id: "qwen/qwen3.8-max-0902", name: "Qwen: Qwen3.8 Max (0902)", free: false, tools: true },
  { id: "z-ai/glm-5.3-flash", name: "Z.ai: GLM 5.3 Flash", free: false, tools: true },
  { id: "xiaomi/mimo-v2.6-pro", name: "Xiaomi: MiMo-V2.6-Pro", free: false, tools: true },
  { id: "meta/muse-spark-1.3", name: "Meta: Muse Spark 1.3", free: false, tools: true },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "NVIDIA: Nemotron 3 Ultra (free)", free: true, tools: true },
  { id: "nex-agi/nex-n2.5-pro:free", name: "Nex AGI: Nex-N2.5-Pro (free)", free: true, tools: true },
  { id: "thinkingmachines/inkling:free", name: "Thinking Machines: Inkling (free)", free: true, tools: true },
  { id: "qwen/qwen3.8-27b:free", name: "Qwen: Qwen3.8 27B (free)", free: true, tools: true },
  { id: "google/gemma-4-31b-it:free", name: "Google: Gemma 4 31B (free)", free: true, tools: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "NVIDIA: Nemotron 3 Super (free)", free: true, tools: true },
  { id: "dots-studio/dots-3-note-preview:free", name: "Dots Studio: Dots3-Note Preview (free)", free: true, tools: true },
  { id: "poolside/laguna-s-2.1:free", name: "Poolside: Laguna S 2.1 (free)", free: true, tools: true },
  { id: "openrouter/free", name: "Free Models Router", free: true, tools: true },
];
