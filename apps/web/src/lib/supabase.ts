// Supabase client — email/password auth + RLS-scoped data access.
// The anon key is public by design; RLS enforces tenant isolation.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
export const SUPABASE_ANON_KEY =
  'sb_publishable_CZXQt2nYfaSnkYF5XoslzQ_LaIIn6wt';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface ProfileRow {
  id: string;
  display_name: string | null;
  plan: 'free' | 'builder';
  is_admin: boolean;
  training_opt_in: boolean;
}

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  place_name: string | null;
  place_id: number | null;
  memory_summary: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  /** Null while the project is active. Set when it is archived — see lib/archive.ts. */
  archived_at?: string | null;
  /**
   * Null unless the user pinned this project to the top of both lists.
   *
   * A timestamp rather than a flag so several pins sort among themselves by when they were pinned
   * — see infra/supabase/migrations/0007_project_pinning.sql.
   */
  pinned_at?: string | null;
  /**
   * The user's own labels for this project. `not null default '{}'` in Postgres, so the array is
   * never null — but optional HERE, because a row fetched by an older build, or before 0008 lands,
   * arrives without the field. See lib/tags.ts.
   */
  tags?: string[];
}

/** Current access token, refreshed by supabase-js when expired. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
