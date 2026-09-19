/** User-selected creation intent; the normal authenticated run owns tools, billing and results. */
export type CreationIntent = 'build' | 'image' | 'model';

export function maxUpgradeAvailable(config?: { checkout: boolean; purchasable: readonly string[] }): boolean | null {
  if (!config) return null;
  return config.checkout && config.purchasable.some((plan) => plan === 'builder' || plan === 'studio');
}

export function maxAccessNotice(available: boolean | null): string {
  return available === false
    ? 'Apple MAX is required. Paid subscriptions are not available yet. Your draft is kept.'
    : 'Apple MAX is required. Subscription availability could not be confirmed. Check Usage and Credits; your draft is kept.';
}

export const CREATION_INTENTS = {
  build: { label: 'Build', placeholder: 'Describe the world you want to make.', note: '' },
  image: {
    label: 'Image',
    placeholder: 'Describe an icon, texture, or concept image…',
    note: 'Generated images are saved with this project. Download a copy to keep outside Apple. Nothing is uploaded to Roblox.',
  },
  model: {
    label: '3D',
    placeholder: 'Describe a 3D prop to create in Studio…',
    note: 'Requires connected Roblox Studio and GenerationService access. Generated models are session-only until you accept and save them in Studio.',
  },
} as const;

const PREFIX: Record<CreationIntent, string> = {
  build: '',
  image: 'Generate an image using generate_image and show the result here. Do not edit my place or upload assets to Roblox. Subject: ',
  model: 'Generate a 3D model using generate_model in my connected Studio, then inspect its quality. Do not publish or upload assets. Tell me if generation is unavailable and do not silently substitute another method. Model: ',
};

/** Never silently truncate a user's description to make room for an intent. */
export function creationMessage(intent: CreationIntent, description: string, limit: number): string | null {
  const text = description.trim();
  if (!text) return null;
  const message = PREFIX[intent] + text;
  return message.length <= limit ? message : null;
}
