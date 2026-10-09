import { DurableObject } from 'cloudflare:workers';

/**
 * The Flue agent's Durable Object class (rebuild R3), kept as an empty class so its stored conversations are not
 * deleted with it: CLAUDE.md holds data for 7 days after its replacement is verified. Remove it, with a
 * `deleted_classes` migration, after that.
 */
export class FlueStudPilotAgent extends DurableObject {
  /** Read-only dump of what this object stored, for the operator's export (server.ts /studio/api/admin/object). */
  async dumpStorage(): Promise<StorageDump> {
    return dumpStorage(this.ctx.storage);
  }
}

export interface StorageDump { kv: Record<string, unknown>; tables: Record<string, unknown[]> }

/** Every key-value entry and every SQLite table row (bounded) of a Durable Object's storage. Reads only. */
export async function dumpStorage(storage: DurableObjectStorage): Promise<StorageDump> {
  const kv: Record<string, unknown> = {};
  for (const [k, v] of await storage.list({ limit: 1000 })) kv[k] = v;
  const tables: Record<string, unknown[]> = {};
  const names = storage.sql.exec(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%'`).toArray() as { name: string }[];
  for (const { name } of names) tables[name] = storage.sql.exec(`select * from "${name.replace(/"/g, '""')}" limit 5000`).toArray();
  return { kv, tables };
}
