import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KNOWN_ISSUES } from '../src/data/known-issues.ts';

const page = route => readFileSync(new URL(`../dist/${route}/index.html`, import.meta.url), 'utf8');
const text = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

function assertRecoveryLinks(html) {
  const entries = KNOWN_ISSUES.filter(issue => !issue.resolvedAt && issue.links?.length);
  assert.ok(entries.length > 0, 'No recovery links to check');
  for (const issue of entries) {
    const start = html.indexOf(`id="${issue.id}"`);
    assert.ok(start >= 0, `Missing issue ${issue.id}`);
    const next = html.indexOf('class="known__item"', start + issue.id.length + 5);
    const section = html.slice(start, next < 0 ? undefined : next);
    for (const link of issue.links) {
      assert.ok(section.includes(`href="${link.href}"`), `${issue.id}: recovery destination is not a link: ${link.href}`);
      assert.ok(text(section).includes(link.label), `${issue.id}: link has no readable label`);
    }
  }
}

test('built status makes each issue recovery destination a real link', () => {
  assertRecoveryLinks(page('status'));
});

test('recovery guard rejects the previous inert-text failure', () => {
  const html = page('status');
  const broken = html.replaceAll('href="/docs/plugin"', 'data-inert="/docs/plugin"');
  assert.notEqual(html, broken, 'Mutation did not hit the rendered link');
  assert.throws(() => assertRecoveryLinks(broken), /recovery destination is not a link/);
});

//[[ RESTATED 2026-09-22, WHEN THE FLAG FLIPPED. It asserted the not-live sentence ("Public plugin
//   installation is currently unavailable") UNCONDITIONALLY, so the day the listing came back and
//   packages/shared set STUDIO_PLUGIN_STORE_LIVE to true, this demanded that the page keep telling
//   readers they could not install a plugin they could. The property was always "availability is
//   disclosed BEFORE the steps, and it is the true availability" — so the expected disclosure is now
//   read off the flag: live, the page links the store listing (derived from the asset id) ahead of
//   step one; not live, it says installation is unavailable ahead of step one. ]]
const SHARED = readFileSync(new URL('../../../packages/shared/src/index.ts', import.meta.url), 'utf8');
const FLAG = /export const STUDIO_PLUGIN_STORE_LIVE(?::\s*boolean)?\s*=\s*(true|false)\s*;/.exec(SHARED);
const ASSET = /export const STUDIO_PLUGIN_ASSET_ID\s*=\s*'(\d+)'/.exec(SHARED);

function assertDisclosure(html, storeLive, assetId) {
  const content = text(html);
  const steps = content.indexOf('Open the place you want');
  assert.ok(steps > 0, 'the connection steps were not found — this check would compare nothing');
  if (storeLive) {
    const href = `href="https://create.roblox.com/store/asset/${assetId}"`;
    const at = html.indexOf(href);
    assert.ok(at > 0, 'the plugin is installable, but the connect page does not link the store listing');
    assert.ok(text(html.slice(0, at)).length < steps, 'the store link comes after the steps, not before them');
  } else {
    const at = content.search(/Public (?:Studio |plugin )?installation is (?:currently )?unavailable/);
    assert.ok(at >= 0, 'the plugin cannot be installed, and the connect page does not say so');
    assert.ok(at < steps, 'the unavailability notice comes after the steps, not before them');
  }
  assert.match(content, /temporary credential/);
  assert.doesNotMatch(content, /nothing sensitive ever/);
}

test('connection instructions disclose installation availability before the steps', () => {
  assert.ok(FLAG && ASSET, 'the plugin flag or asset id is no longer readable from packages/shared');
  assertDisclosure(page('docs/connect'), FLAG[1] === 'true', ASSET[1]);
});

test('the disclosure guard rejects a connect page that hides availability', () => {
  const html = page('docs/connect');
  const live = FLAG[1] === 'true';
  const stripped = live
    ? html.replaceAll(`https://create.roblox.com/store/asset/${ASSET[1]}`, '/nowhere')
    : html.replace(/Public (?:Studio |plugin )?installation is (?:currently )?unavailable/g, 'Welcome');
  assert.notEqual(stripped, html, 'the mutation did not land — re-aim it before trusting this test');
  assert.throws(() => assertDisclosure(stripped, live, ASSET[1]));
});

test('the modes guide keeps product models separate from ProductMode', () => {
  const content = text(page('docs/modes'));
  assert.match(content, /Apple and Apple MAX are model choices/i);
  assert.match(content, /Plan and Agent/i);
  assert.match(content, /Autonomous is a toggle on Agent, not another mode/i);
});

/*
 * THE DISCLOSURE STAYED; THE THING BEING DISCLOSED CHANGED.
 *
 * This asserted the literal "not a complete archive", which was the honest description of a file
 * that left your conversations, your checkpoints and your spend history out of itself — measured on
 * the live product on 2026-09-20 as 23,899 bytes reading `"complete": false`.
 *
 * settings.tsx now follows those routes on the click and writes one file: measured the same day,
 * 159,032 bytes across 101 routes with nothing failing, seven transcripts and twenty messages
 * inside it. Two things genuinely stay out — bytes, which cannot be lines of JSON, and a live
 * Studio pairing code, which would be a working key in a downloaded file — and a route that does
 * not answer is named rather than dropped.
 *
 * So the rule is the same rule, pointed at what is true: the pages must still say what the file
 * does NOT hold. Keeping the old literal would have forced a page to advertise a limit the product
 * no longer has, which is the same defect in the other direction.
 * apps/site/tests/export-completeness-claim.test.mjs is the two-sided version, derived from the
 * app's own source table rather than from a phrase.
 */
test('both privacy surfaces disclose what the export leaves out, and operator access', () => {
  for (const route of ['privacy', 'docs/privacy-and-data']) {
    const content = text(page(route));
    assert.match(content, /bytes/i, `${route} does not say bytes stay out of the export`);
    assert.match(content, /pairing code/i, `${route} does not say the pairing code is withheld`);
    assert.match(content, /(does not answer|did not answer)/i, `${route} does not say what a failed route looks like`);
    assert.match(content, /operators.{0,100}access production systems/i);
    assert.doesNotMatch(content, /only readable by you|Nobody else\./);
  }
});
