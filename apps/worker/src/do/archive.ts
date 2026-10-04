// The Durable Objects of the former `golem` Worker, moved here with their storage by a
// `transferred_classes` migration (handoff 1.3) so the data survives `golem` becoming a proxy.
//
// Nothing serves them. A request answers 410, and an alarm left over from `golem` does nothing, so an
// old agent loop cannot resume under today's code and spend. ArchiveQuotaDO is the one exception: it
// is the billing replica that LEGACY_QUOTA_DO delivers to, so it keeps QuotaDO's behaviour.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { QuotaDO } from './quota';

class Archived extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return new Response('archived', { status: 410 });
  }
  async alarm(): Promise<void> {}
}

export class ArchiveSessionDO extends Archived {}
export class ArchiveAdminDO extends Archived {}
export class ArchivePairingDO extends Archived {}
export class ArchiveBudgetDO extends Archived {}
export class ArchiveDiscordDO extends Archived {}
export class ArchiveQuotaDO extends QuotaDO {}
