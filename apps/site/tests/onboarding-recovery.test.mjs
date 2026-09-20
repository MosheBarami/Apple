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

test('connection instructions disclose installation availability before the steps', () => {
  const html = page('docs/connect');
  const content = text(html);
  assert.match(content, /Public plugin installation is currently unavailable/);
  assert.ok(content.indexOf('Public plugin installation is currently unavailable') < content.indexOf('Open the place you want'));
  assert.match(content, /temporary credential/);
  assert.doesNotMatch(content, /nothing sensitive ever/);
});

test('MAX describes a notice, not an automatic navigation or model switch', () => {
  const content = text(page('docs/modes'));
  assert.match(content, /availability notice/);
  assert.match(content, /keeps your draft/);
  assert.doesNotMatch(content, /opens plan availability/);
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
