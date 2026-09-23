// TURNSTILE ON THE PUBLIC AUTH DOORS (D-VISION-1) — lib/turnstile.ts and where it is wired.
//
// The token getter is driven with a stand-in `window.turnstile`, since the real widget needs a
// browser; the wiring is checked in the source, because a form that forgot to ask for a token
// compiles and works perfectly until Supabase's captcha is switched on — then it refuses everyone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TURNSTILE_SITE_KEY, captchaOptions, turnstileToken } from '../src/lib/turnstile.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(WEB, 'src', p), 'utf8');

function fakeWidget(behaviour) {
  const log = { rendered: [], removed: [], disposed: 0 };
  const api = {
    render(_el, opts) {
      log.rendered.push(opts);
      behaviour(opts);
      return 'w1';
    },
    remove(id) {
      log.removed.push(id);
    },
  };
  const deps = { load: async () => api, mount: () => ({ el: {}, dispose: () => { log.disposed += 1; } }), timeoutMs: 50 };
  return { deps, log };
}

test('a token from the widget is returned, and the widget is removed afterwards', async () => {
  const { deps, log } = fakeWidget((o) => o.callback('XXXX.DUMMY.TOKEN.XXXX'));
  assert.equal(await turnstileToken('signup', deps), 'XXXX.DUMMY.TOKEN.XXXX');
  assert.equal(log.rendered[0].sitekey, TURNSTILE_SITE_KEY);
  assert.equal(log.rendered[0].action, 'signup');
  assert.equal(log.rendered[0].appearance, 'interaction-only', 'invisible unless Cloudflare needs a click');
  assert.deepEqual(log.removed, ['w1']);
  assert.equal(log.disposed, 1);
});

test("Cloudflare's always-pass test key is accepted as a site key", async () => {
  const { deps, log } = fakeWidget((o) => o.callback('XXXX.DUMMY.TOKEN.XXXX'));
  assert.equal(await turnstileToken('signin', { ...deps, siteKey: '1x00000000000000000000AA' }), 'XXXX.DUMMY.TOKEN.XXXX');
  assert.equal(log.rendered[0].sitekey, '1x00000000000000000000AA');
});

test('an error, an expiry, a timeout, a blocked script: null, never a hang or a throw', async () => {
  for (const cb of ['error-callback', 'expired-callback', 'timeout-callback']) {
    const { deps, log } = fakeWidget((o) => o[cb]());
    assert.equal(await turnstileToken('reset', deps), null, cb);
    assert.equal(log.disposed, 1);
  }
  const silent = fakeWidget(() => {});
  assert.equal(await turnstileToken('reset', silent.deps), null, 'the widget never answers: timed out');
  assert.equal(await turnstileToken('reset', { load: async () => { throw new Error('blocked'); } }), null);
  const throwing = fakeWidget(() => { throw new Error('bad sitekey'); });
  assert.equal(await turnstileToken('reset', throwing.deps), null);
});

test('outside a browser there is no widget to ask', async () => {
  assert.equal(await turnstileToken('signin'), null);
});

test('Supabase is sent captchaToken only when there is one', () => {
  assert.deepEqual(captchaOptions('tok'), { captchaToken: 'tok' });
  assert.deepEqual(captchaOptions(null), {});
});

test('every public auth call asks for a token first', () => {
  const pages = src('routes/auth-pages.tsx');
  assert.match(pages, /signInWithPassword\(\{[\s\S]{0,120}captchaOptions\(await turnstileToken\('signin'\)\)/);
  assert.match(pages, /signUp\(\{[\s\S]{0,400}captchaOptions\(await turnstileToken\('signup'\)\)/);
  assert.match(pages, /resetPasswordForEmail\(address, \{[\s\S]{0,120}captchaOptions\(await turnstileToken\('reset'\)\)/);
  assert.equal((pages.match(/captchaOptions\(await turnstileToken\('resend'\)\)/g) ?? []).length, 2, 'both resend buttons');
  assert.match(pages, /submitRecoveryRequest\(email\.trim\(\), note\.trim\(\), await turnstileToken\('recovery'\)\)/);
  assert.match(src('components/reauth-dialog.tsx'), /captchaOptions\(await turnstileToken\('reauth'\)\)/);
  assert.match(src('routes/settings.tsx'), /captchaOptions\(await turnstileToken\('resend'\)\)/);
  // No call site left behind: every gated Supabase call in the app carries a token.
  const all = ['routes/auth-pages.tsx', 'components/reauth-dialog.tsx', 'routes/settings.tsx'].map(src).join('\n');
  const calls = all.match(/auth\.(signInWithPassword|signUp|resend|resetPasswordForEmail)\(/g) ?? [];
  const tokens = all.match(/captchaOptions\(await turnstileToken\(/g) ?? [];
  assert.equal(tokens.length, calls.length);
});

test('the recovery request carries the token in its body; a captcha refusal reads as a sentence', async () => {
  assert.match(src('lib/api.ts'), /turnstileToken \? \{ email, note, turnstileToken \} : \{ email, note \}/);
  const { authErrorMessage } = await import('../src/lib/auth-flows.ts');
  assert.equal(authErrorMessage({ message: 'captcha protection: request disallowed (timeout-or-duplicate)' }), 'We could not confirm you are a person. Refresh the page and try again.');
});

test('on-screen images ask for the display copy; downloads still get the original', () => {
  const api = src('lib/api.ts');
  assert.match(api, /\$\{width \? `\?w=\$\{width\}` : ''\}/);
  assert.match(src('lib/generative-ui/render.tsx'), /fetchImageObjectUrl\(internal\.projectId, internal\.imageId, 1024\)/);
  assert.match(api, /const blob = await fetchImage\(projectId, imageId\);/, 'download passes no width');
});
