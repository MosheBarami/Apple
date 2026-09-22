// Local stand-in for AI Elements' `packages/shadcn-ui/lib/utils.ts`, where `cn` is
// `twMerge(clsx(inputs))`.
//
// Only the clsx half is reproduced. tailwind-merge exists to resolve CONFLICTING Tailwind
// utilities (`px-2` against `px-4`), and this app has no Tailwind: the utility strings the vendored
// components keep are inert, so there is never a conflict to resolve. What matters here is that
// every class a component names reaches the DOM, including the BEM classes the app styles.
export type ClassDictionary = Record<string, unknown>;
export type ClassValue =
  | ClassValue[]
  | ClassDictionary
  | string
  | number
  | bigint
  | null
  | boolean
  | undefined;

function flatten(value: ClassValue, out: string[]): void {
  if (!value) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, out);
    return;
  }
  if (typeof value === 'object') {
    for (const [name, on] of Object.entries(value)) if (on) out.push(name);
  }
}

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) flatten(input, out);
  return out.join(' ');
}
