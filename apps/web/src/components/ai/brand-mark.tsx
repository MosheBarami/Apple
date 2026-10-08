import manifest from '../../../public/brands/manifest.json';

const assets = new Map(manifest.assets.map((asset) => [asset.id, asset.file]));
const publishers: Record<string, string> = { Qwen: 'qwen', 'deepseek-ai': 'deepseek', 'zai-org': 'zai',
  'meta-llama': 'meta', 'meta-models': 'meta', moonshotai: 'moonshot', google: 'google', openai: 'openai',
  MiniMaxAI: 'minimax', nvidia: 'nvidia', CohereLabs: 'cohere', 'Z.AI': 'zai', Anthropic: 'anthropic',
  Google: 'google', OpenAI: 'openai', 'Mistral AI': 'mistral', 'Moonshot AI': 'moonshot', MiniMax: 'minimax',
  'Alibaba Cloud': 'alibaba', Cohere: 'cohere', xAI: 'xai' };
Object.assign(publishers, { Meta: 'meta', NVIDIA: 'nvidia', DeepSeek: 'deepseek', Mistral: 'mistral', 'MistralAI': 'mistral',
  'Alibaba': 'alibaba', 'Qwen': 'qwen', 'Moonshot': 'moonshot', 'Anthropic': 'anthropic' });
export function hasBrandAsset(id: string): boolean { return assets.has(id) || assets.has(publishers[id] ?? ''); }
export function BrandMark({ brand, label }: { brand: string; label?: string }) {
  const file = assets.get(brand === 'qwen' ? 'alibaba' : brand) ?? assets.get(publishers[brand] ?? '');
  if (!file) return null;
  return <span className="ai-brand-mark"><img src={`${import.meta.env.BASE_URL}${file.slice(1)}`} alt={label ?? ''} width="24" height="24" loading="lazy" /></span>;
}
