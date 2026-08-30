// Sends one chat to a project over WS and prints the full agent transcript.
// Usage: node infra/real-chat.mjs <mode> "<message>"
import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(root + '/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = process.env.API_BASE;
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + '/apps/worker/wrangler.jsonc', 'utf8').match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)[1];
const [mode, text] = [process.argv[2] ?? 'stone', process.argv[3] ?? 'hello'];
const { access_token: jwt } = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'e2e-test@golem.internal', password: 'golem-e2e-Passw0rd!' }),
})).json();
const projectId = 'b0766f21-7028-47cc-b9ab-e19198b144d2';
const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${projectId}/ws`, ['golem.v1', 'golem.jwt.' + jwt]);
let finalText = '';
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
const timer = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240_000);
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'hello') {
    console.log(stamp(), `hello (studioConnected=${msg.studioConnected}, sparks=${msg.quota.sparksRemaining})`);
    ws.send(JSON.stringify({ type: 'chat', text, mode }));
  } else if (msg.type === 'delta') { finalText += msg.text; }
  else if (msg.type === 'tool_start') console.log(stamp(), `→ ${msg.tool}`);
  else if (msg.type === 'tool_end') console.log(stamp(), `  ${msg.ok ? '✓' : '✗'} ${msg.summary}`);
  else if (msg.type === 'agent_status') console.log(stamp(), `[${msg.phase}${msg.step ? ' ' + msg.step + '/' + msg.totalSteps : ''}]`);
  else if (msg.type === 'checkpoint') console.log(stamp(), `checkpoint: ${msg.checkpoint.label} (${msg.checkpoint.scriptCount} scripts, ${msg.checkpoint.instanceCount} instances, ${(msg.checkpoint.sizeBytes/1024).toFixed(1)}KB)`);
  else if (msg.type === 'error') console.log(stamp(), 'ERROR:', msg.code, msg.message);
  else if (msg.type === 'msg_end') {
    clearTimeout(timer);
    console.log(stamp(), `msg_end (${msg.stopReason})`);
    console.log('--- REPLY ---');
    console.log(finalText.slice(0, 1500));
    process.exit(msg.stopReason === 'done' ? 0 : 1);
  }
};
ws.onerror = (e) => { console.log('ws error', e.message); process.exit(3); };
