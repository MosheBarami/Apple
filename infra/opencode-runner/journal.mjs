import { DatabaseSync } from 'node:sqlite';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const aad = (id, hash) => encoder.encode(JSON.stringify(['runner-job-v1', id, hash]));

/** Five-minute encrypted result receipts. No prompt, stderr, provider key or signing key in SQLite. */
export class JobJournal {
  constructor(path, encryptionKey, now = Date.now) {
    const bytes = Buffer.from(encryptionKey ?? '', 'base64');
    if (bytes.length !== 32) throw new Error('Durable runner jobs require an independent 32-byte encryption key.');
    this.key = crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    this.now = now; this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, hash TEXT NOT NULL, status TEXT NOT NULL,
      updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, sealed TEXT
    ); CREATE TABLE IF NOT EXISTS catalogs (
      version TEXT PRIMARY KEY, body TEXT NOT NULL, expires_at INTEGER NOT NULL
    ); UPDATE jobs SET status = 'interrupted' WHERE status = 'running';`);
    this.prune();
  }
  prune() {
    this.db.prepare('DELETE FROM jobs WHERE expires_at < ?').run(this.now());
    this.db.prepare('DELETE FROM catalogs WHERE expires_at < ?').run(this.now());
  }
  saveCatalog(catalog) {
    this.db.prepare('INSERT OR REPLACE INTO catalogs(version,body,expires_at) VALUES (?,?,?)')
      .run(catalog.version, JSON.stringify(catalog), this.now() + 3600_000);
  }
  catalog(version) {
    this.prune(); const row = this.db.prepare('SELECT body FROM catalogs WHERE version=?').get(version);
    return row ? JSON.parse(row.body) : null;
  }
  get(id) { this.prune(); return this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) ?? null; }
  begin(id, hash) {
    this.prune();
    this.db.prepare(`INSERT INTO jobs(id,hash,status,updated_at,expires_at) VALUES (?,?,'running',?,?)`)
      .run(id, hash, this.now(), this.now() + 300_000);
  }
  async finish(id, hash, response) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(id, hash) },
      await this.key, encoder.encode(JSON.stringify(response)));
    const sealed = Buffer.from(iv).toString('base64') + '.' + Buffer.from(ciphertext).toString('base64');
    this.db.prepare(`UPDATE jobs SET status='completed', sealed=?, updated_at=? WHERE id=? AND hash=?`)
      .run(sealed, this.now(), id, hash);
  }
  async result(id, hash) {
    const record = this.get(id);
    if (!record || record.hash !== hash || record.status !== 'completed' || !record.sealed) return null;
    const [iv, ciphertext] = record.sealed.split('.');
    try {
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64'), additionalData: aad(id, hash) },
        await this.key, Buffer.from(ciphertext, 'base64'));
      return JSON.parse(decoder.decode(plaintext));
    } catch { throw new Error('The saved runner result could not be decrypted.'); }
  }
  close() { this.db.close(); }
}
