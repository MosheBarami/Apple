// A correct consumer. This file MUST compile clean.
import {
  ApiError,
  AppleClient,
  SessionStream,
  StudioClient,
  applyServerMsg,
  emptyRun,
  parseArgs,
  pollWaitMs,
  type Memory,
  type Run,
} from '../index';
import type { GolemMode, MessageDto } from '@golem/shared';

const client = new AppleClient({ baseUrl: 'https://api.test', token: 'jwt' });

export async function main(projectId: string): Promise<string> {
  const health = await client.health();
  const { messages } = await client.messages(projectId, { limit: 20 });
  const first: MessageDto | undefined = messages[0];

  const memory: Memory = { summary: 'a tower', facts: ['the door is red'] };
  await client.saveMemory(projectId, memory);
  await client.startCheckout('studio');

  // A token that refreshes: the callable form.
  const refreshing = new AppleClient({ token: async () => 'fresh-jwt' });
  await refreshing.me();

  const studio = new StudioClient({ baseUrl: 'https://api.test', version: '0.2.0', protocol: 1 });
  const claim = await studio.claim('GLM-7F3K2Q');
  const poll = await studio.poll({ results: [], events: [] });
  const wait: number = pollWaitMs(poll);

  const mode: GolemMode = 'stone';
  const stream = new SessionStream({ baseUrl: 'https://api.test', projectId, token: 'jwt' }).connect();
  stream.sendChat('build a door', mode);
  const run: Run = applyServerMsg(emptyRun(), { type: 'delta', msgId: 'm1', text: 'hi' });
  stream.close();

  const parsed = parseArgs(['messages', projectId, '--limit', '10']);

  try {
    await client.purge(projectId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return 'gone';
  }

  return [health.buildSha, first?.id ?? '', claim.projectId, String(wait), run.text, parsed.command ?? '']
    .join(' ');
}
