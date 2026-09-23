// Supabase action specs for the command palette. The only write is the existing local backup (a
// read of every public table into .backups/ on this machine); the SQL runner, row preview and log
// explorer are reads the page calls directly, so they are not palette actions.
import { sb } from '../actions.js';

export function catalog(seen = {}) {
  return seen.supabase && seen.supabase.ok !== false ? [sb.backup()] : [];
}
