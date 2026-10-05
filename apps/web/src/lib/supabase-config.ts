// The Supabase project's address and its public (publishable) key. Both are public by design: Row Level Security,
// not secrecy, is what isolates one account from another. They are here, apart from lib/supabase.ts, so a module
// that only needs to ask the project a question (lib/auth-providers.ts) does not build a client by importing them.
export const SUPABASE_URL = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_CZXQt2nYfaSnkYF5XoslzQ_LaIIn6wt';
