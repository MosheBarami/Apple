// Placeholder: replaced by the docs-search workstream (D1 FTS5 over Roblox Creator Docs and Luau docs).
export interface DocHit { title: string; heading: string; url: string; snippet: string; source: 'Roblox Creator Docs' | 'Luau'; kind: 'guide' | 'api' }
export async function searchDocs(_db: D1Database, _query: string, _opts?: { limit?: number; source?: 'roblox' | 'luau' | 'all' }): Promise<DocHit[]> { return []; }
export async function readDoc(_db: D1Database, url: string): Promise<{ url: string; title: string; text: string } | null> { return { url, title: '', text: '' }; }
