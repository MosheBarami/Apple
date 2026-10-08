import type { AiProviderId, ApiProtocol } from '@studpilot/shared';

export interface ApiProviderDefinition {
  id: AiProviderId; name: string; producer: string | null; protocol: ApiProtocol;
  origin: string; path: string; modelsPath: string | null; docs: string;
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  discoveryPublic?: boolean;
}
/** Fixed server-owned origins prevent credentials from following redirects or a browser URL. */
export const API_PROVIDERS: Record<AiProviderId, ApiProviderDefinition> = {
  openai: { id: 'openai', name: 'OpenAI', producer: 'OpenAI', protocol: 'responses', origin: 'https://api.openai.com',
    path: '/v1/responses', modelsPath: '/v1/models', docs: 'https://developers.openai.com/api/reference/resources/models' },
  anthropic: { id: 'anthropic', name: 'Anthropic', producer: 'Anthropic', protocol: 'anthropic', origin: 'https://api.anthropic.com',
    path: '/v1/messages', modelsPath: '/v1/models', docs: 'https://platform.claude.com/docs/en/api/models/list' },
  google: { id: 'google', name: 'Google Gemini', producer: 'Google', protocol: 'gemini', origin: 'https://generativelanguage.googleapis.com',
    path: '/v1beta/models', modelsPath: '/v1beta/models', docs: 'https://ai.google.dev/api/models' },
  xai: { id: 'xai', name: 'xAI', producer: 'xAI', protocol: 'responses', origin: 'https://api.x.ai',
    path: '/v1/responses', modelsPath: '/v1/models', docs: 'https://docs.x.ai/developers/rest-api-reference/inference/responses' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', producer: 'DeepSeek', protocol: 'chat-completions', origin: 'https://api.deepseek.com',
    path: '/chat/completions', modelsPath: '/models', docs: 'https://api-docs.deepseek.com/en/' },
  mistral: { id: 'mistral', name: 'Mistral AI', producer: 'Mistral AI', protocol: 'chat-completions', origin: 'https://api.mistral.ai',
    path: '/v1/chat/completions', modelsPath: '/v1/models', docs: 'https://docs.mistral.ai/api/endpoint/models' },
  groq: { id: 'groq', name: 'Groq', producer: null, protocol: 'chat-completions', origin: 'https://api.groq.com',
    path: '/openai/v1/chat/completions', modelsPath: '/openai/v1/models', docs: 'https://console.groq.com/docs/api-reference' },
  cerebras: { id: 'cerebras', name: 'Cerebras', producer: null, protocol: 'chat-completions', origin: 'https://api.cerebras.ai',
    path: '/v1/chat/completions', modelsPath: '/v1/models', docs: 'https://inference-docs.cerebras.ai/api-reference/models/list-models' },
  together: { id: 'together', name: 'Together AI', producer: null, protocol: 'chat-completions', origin: 'https://api.together.xyz',
    path: '/v1/chat/completions', modelsPath: '/v1/models', docs: 'https://docs.together.ai/reference/models' },
  fireworks: { id: 'fireworks', name: 'Fireworks AI', producer: null, protocol: 'chat-completions', origin: 'https://api.fireworks.ai',
    path: '/inference/v1/chat/completions', modelsPath: '/v1/accounts/fireworks/models', docs: 'https://docs.fireworks.ai/api-reference/list-models' },
  openrouter: { id: 'openrouter', name: 'OpenRouter', producer: null, protocol: 'chat-completions', origin: 'https://openrouter.ai',
    path: '/api/v1/chat/completions', modelsPath: '/api/v1/models', discoveryPublic: true,
    docs: 'https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties' },
  deepinfra: { id: 'deepinfra', name: 'DeepInfra', producer: null, protocol: 'chat-completions', origin: 'https://api.deepinfra.com',
    path: '/v1/openai/chat/completions', modelsPath: '/models/list', discoveryPublic: true, docs: 'https://docs.deepinfra.com/chat/overview' },
  moonshot: { id: 'moonshot', name: 'Moonshot AI', producer: 'Moonshot AI', protocol: 'chat-completions', origin: 'https://api.moonshot.ai',
    path: '/v1/chat/completions', modelsPath: '/v1/models', docs: 'https://platform.moonshot.ai/docs' },
  minimax: { id: 'minimax', name: 'MiniMax', producer: 'MiniMax', protocol: 'chat-completions', origin: 'https://api.minimax.io',
    path: '/v1/chat/completions', modelsPath: null, maxTokensField: 'max_completion_tokens',
    docs: 'https://platform.minimax.io/docs/api-reference/text-openai-api' },
  zai: { id: 'zai', name: 'Z.AI', producer: 'Z.AI', protocol: 'chat-completions', origin: 'https://api.z.ai',
    path: '/api/paas/v4/chat/completions', modelsPath: null, docs: 'https://docs.z.ai/api-reference/llm/chat-completion' },
  qwen: { id: 'qwen', name: 'Alibaba Cloud', producer: 'Alibaba Cloud', protocol: 'chat-completions', origin: 'https://dashscope-intl.aliyuncs.com',
    path: '/compatible-mode/v1/chat/completions', modelsPath: '/compatible-mode/v1/models',
    docs: 'https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope' },
  huggingface: { id: 'huggingface', name: 'Hugging Face', producer: null, protocol: 'chat-completions', origin: 'https://router.huggingface.co',
    path: '/v1/chat/completions', modelsPath: '/v1/models', discoveryPublic: true,
    docs: 'https://huggingface.co/docs/inference-providers/tasks/chat-completion' },
  cohere: { id: 'cohere', name: 'Cohere', producer: 'Cohere', protocol: 'cohere', origin: 'https://api.cohere.com',
    path: '/v2/chat', modelsPath: '/v1/models', docs: 'https://docs.cohere.com/reference/list-models' },
  cloudflare: { id: 'cloudflare', name: 'Cloudflare Workers AI', producer: null, protocol: 'workers-http', origin: 'https://api.cloudflare.com',
    path: '/client/v4/accounts', modelsPath: '/ai/models/search', docs: 'https://developers.cloudflare.com/workers-ai/models/' },
};

export function apiProvider(id: AiProviderId): ApiProviderDefinition {
  const provider = API_PROVIDERS[id];
  if (!provider) throw new Error('Unknown AI provider.');
  return provider;
}
