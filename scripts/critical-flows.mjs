#!/usr/bin/env node
/**
 * Prove the four critical SaaS flows against the DEPLOYED product, or say which one could not be
 * proven and why.
 *
 * THREE VERDICTS, NOT TWO. Every check returns `pass`, `fail` or `unknown`, and `unknown` is the
 * one that matters. A prober that can only say pass/fail reports its own blindness as a verdict
 * about the product — which is the defect this repository keeps finding in its own instruments:
 * a liveness probe answering 404 for a plugin thousands of people have installed, a spec runner
 * calling a syntax error a failed assertion, a dataset auditor calling a shape it cannot read
 * NOT_READY. An `unknown` here is a demand for a better instrument, not a passing grade.
 *
 * EVERY CHECK CARRIES A CONTROL. "The protected route returned 401" proves authentication only if
 * something else proves the request reached the worker at all; otherwise a DNS failure and a
 * working auth gate look identical. The controls are named in each check's `why`.
 *
 * Nothing here signs in as a real customer, and no check pretends to. Flows that need a session
 * are reported `unknown` with the credential they would need — not quietly skipped, and not
 * counted as passing because the endpoint refused an anonymous caller in the expected way.
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.APPLE_BASE_URL ?? 'https://apple.moshe-barami111.workers.dev';
const results = [];

const record = (flow, name, verdict, why, detail) => {
  results.push({ flow, name, verdict, why, detail });
};

async function probe(path, init = {}) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, { ...init, redirect: 'manual' });
    const text = await res.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json, keep the text */ }
    return { ok: true, status: res.status, json, text: text.slice(0, 400), ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - started };
  }
}

// ---------------------------------------------------------------- the control
/**
 * Does anything at all reach the worker? Every other verdict is conditioned on this.
 */
async function reachability() {
  const health = await probe('/api/health');
  if (!health.ok) {
    record('control', 'the worker is reachable', 'unknown', `the request never completed: ${health.error}`);
    return false;
  }
  if (health.status !== 200) {
    record('control', 'the worker is reachable', 'fail', `/api/health answered ${health.status}, so nothing below is a verdict about a working service`, health.text);
    return false;
  }
  record('control', 'the worker is reachable', 'pass', `/api/health 200 in ${health.ms}ms`, JSON.stringify(health.json)?.slice(0, 200));
  return true;
}

// ---------------------------------------------------------------- authentication
async function authentication() {
  const anonymous = await probe('/api/me');
  if (!anonymous.ok) return record('auth', 'a protected route refuses an anonymous caller', 'unknown', `request failed: ${anonymous.error}`);
  if (anonymous.status === 401) {
    record('auth', 'a protected route refuses an anonymous caller', 'pass', '/api/me answered 401, and /api/health answered 200 in the same run, so the request reached the worker and the gate refused it');
  } else {
    record('auth', 'a protected route refuses an anonymous caller', 'fail', `/api/me answered ${anonymous.status} with no credential`, anonymous.text);
  }

  const forged = await probe('/api/me', { headers: { Authorization: 'Bearer not.a.real.token' } });
  if (!forged.ok) return record('auth', 'a forged token is refused', 'unknown', `request failed: ${forged.error}`);
  record('auth', 'a forged token is refused', forged.status === 401 ? 'pass' : 'fail',
    `a syntactically plausible bearer token answered ${forged.status}`, forged.text);

  // A gate that refuses everything is not a gate, it is an outage. The exempt route separates them.
  const exempt = await probe('/api/billing/config');
  record('auth', 'the gate is selective, not a blanket refusal', exempt.ok && exempt.status === 200 ? 'pass' : 'fail',
    `an AUTH_EXEMPT route answered ${exempt.status}; if this were also 401 the checks above would be an outage wearing a gate's clothes`);

  record('auth', 'a real customer can sign in and use a session', 'unknown',
    'no account credential is available to this probe; refusing anonymous callers correctly says nothing about whether signing in works');
}

// ---------------------------------------------------------------- billing
async function billing() {
  const config = await probe('/api/billing/config');
  if (!config.ok || config.status !== 200) {
    return record('billing', 'the product states what it can sell', 'fail', `/api/billing/config answered ${config.status ?? config.error}`);
  }
  const body = config.json ?? {};
  const shaped = typeof body.checkout === 'boolean' && Array.isArray(body.purchasable) && typeof body.currency === 'string';
  record('billing', 'the product states what it can sell', shaped ? 'pass' : 'fail',
    `checkout=${body.checkout} purchasable=[${body.purchasable}] currency=${body.currency}`);

  // Checkout being OFF is the correct state while the deployment holds test keys — see
  // checkoutConfigured. So this check asserts CONSISTENCY, not that checkout is on: whatever the
  // flag says, the plan list must agree with it.
  const consistent = body.checkout === true ? body.purchasable.length > 0 : body.purchasable.length === 0;
  record('billing', 'the purchasable list agrees with the checkout flag', consistent ? 'pass' : 'fail',
    consistent
      ? `checkout=${body.checkout} and ${body.purchasable.length} plan(s) offered — a page built from this cannot show a button that refuses`
      : `checkout=${body.checkout} but ${body.purchasable.length} plan(s) offered; a page built from this shows a button that cannot work`);

  const anonymousCheckout = await probe('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"plan":"builder"}' });
  record('billing', 'checkout cannot be started without a session', anonymousCheckout.ok && anonymousCheckout.status === 401 ? 'pass' : 'fail',
    `anonymous POST /api/billing/checkout answered ${anonymousCheckout.status}`, anonymousCheckout.text);

  record('billing', 'a customer completes a purchase and is entitled', 'unknown',
    'needs a session, a card and a delivered webhook; the deployment holds TEST keys and the Stripe account reports charges_enabled false, so this cannot be proven here at all');
}

// ---------------------------------------------------------------- monitoring
async function monitoring() {
  let secrets = null;
  try {
    const out = execFileSync('npx', ['wrangler', 'secret', 'list', '--config', 'apps/worker/wrangler.apple.jsonc'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    secrets = JSON.parse(out).map((s) => s.name);
  } catch {
    return record('monitoring', 'error reporting is configured', 'unknown', 'could not list worker secrets; absence of evidence here is not evidence of absence');
  }
  record('monitoring', 'error reporting is configured', secrets.includes('SENTRY_DSN') ? 'pass' : 'fail',
    secrets.includes('SENTRY_DSN') ? 'SENTRY_DSN is set on the deployed worker' : `SENTRY_DSN is NOT set; the worker has ${secrets.join(', ')} — an unhandled error reaches nobody`);

  const health = await probe('/api/health');
  const sha = health.json?.build ?? health.json?.buildSha ?? health.json?.BUILD_SHA ?? null;
  record('monitoring', 'the deployment says which build it is', sha ? 'pass' : 'fail',
    sha ? `/api/health reports build ${sha}` : '/api/health names no build, so a report about "production" cannot be tied to a commit',
    JSON.stringify(health.json)?.slice(0, 200));

  record('monitoring', 'a real error is captured and visible', 'unknown',
    'would require causing a production error on purpose and then reading it back from the collector; not attempted');
}

// ---------------------------------------------------------------- persistence
async function persistence() {
  let tables = null;
  try {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'golem-corpus', '--remote', '--json',
      '--command', "SELECT name FROM sqlite_master WHERE type='table'"], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    tables = JSON.parse(out)[0].results.map((r) => r.name);
  } catch (e) {
    return record('persistence', 'the database is reachable', 'unknown', `could not query D1: ${e.message.slice(0, 120)}`);
  }
  record('persistence', 'the database is reachable', 'pass', `D1 golem-corpus answered with ${tables.length} tables`);

  // Named because a project that survives a restart needs these specific ones. A count of tables
  // proves the database exists, not that the product's own state has somewhere to live.
  const required = ['user_credentials', 'memory_entries', 'asset_library', 'api_keys', 'notifications'];
  const missing = required.filter((t) => !tables.includes(t));
  record('persistence', 'the tables the product stores state in exist', missing.length === 0 ? 'pass' : 'fail',
    missing.length === 0 ? `all of ${required.join(', ')} are present` : `missing: ${missing.join(', ')}`);

  record('persistence', 'a project survives a restart with its files and history', 'unknown',
    'project state lives in Durable Objects, which this probe cannot read without a session; table presence is not the same fact');
}

async function main() {
  console.log(`probing ${BASE}\n`);
  const reachable = await reachability();
  if (reachable) {
    await authentication();
    await billing();
    await monitoring();
    await persistence();
  } else {
    console.log('the worker did not answer; every other flow is unknown rather than failing.\n');
  }

  const mark = { pass: 'PASS   ', fail: 'FAIL   ', unknown: 'UNKNOWN' };
  let flow = null;
  for (const r of results) {
    if (r.flow !== flow) { flow = r.flow; console.log(`\n${flow.toUpperCase()}`); }
    console.log(`  ${mark[r.verdict]} ${r.name}`);
    console.log(`          ${r.why}`);
  }

  const count = (v) => results.filter((r) => r.verdict === v).length;
  console.log(`\npass ${count('pass')} · fail ${count('fail')} · unknown ${count('unknown')}`);
  console.log('an unknown is a missing instrument, not a passing grade.');
  process.exitCode = count('fail') > 0 ? 1 : 0;
}

main();
