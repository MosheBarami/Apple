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

test('both privacy surfaces disclose archive limits and operator access', () => {
  for (const route of ['privacy', 'docs/privacy-and-data']) {
    const content = text(page(route));
    assert.match(content, /not a complete archive/);
    assert.match(content, /operators.{0,100}access production systems/i);
    assert.doesNotMatch(content, /only readable by you|Nobody else\./);
  }
});
