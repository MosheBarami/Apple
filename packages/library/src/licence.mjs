// Master plan §4.1 L2: map a source's licence words to an allowed class, or refuse. Pure.
import { readFileSync } from 'node:fs';

const LICENCES = JSON.parse(readFileSync(new URL('../licenses.json', import.meta.url), 'utf8'));
export const ALLOWED = LICENCES.allowed;

const CLASSES = [
  ['cc0', /\bcc0\b|public domain|creative commons zero/i],
  ['cc-by-4.0', /\bcc[- ]?by[- ]?4(\.0)?\b|attribution 4\.0/i],
  ['cc-by-3.0', /\bcc[- ]?by[- ]?3(\.0)?\b|attribution 3\.0/i],
  ['apache-2.0', /apache[- ]?(license,?[- ]?)?(version[- ]?)?2(\.0)?/i], // also the standard header 'Apache License Version 2.0'
  ['bsd-3-clause', /bsd[- ]?3/i],
  ['bsd-2-clause', /bsd[- ]?2/i],
  // The MIT grant is often published without the word 'MIT' (Roblox's Builder fonts, many repos).
  ['mit', /^\s*mit(\s+licen[cs]e)?\s*$|\bmit licen[cs]e\b|permission is hereby granted, free of charge, to any person obtaining a copy/i],
  ['ofl-1.1', /\bofl\b|open font licen[cs]e/i],
  ['roblox-licensed-audio', /roblox[- ]licen[cs]ed (audio|music)|\bapm\b/i],
  ['roblox-owned', /roblox[- ]owned/i],
  ['roblox-creator-store', /creator store|open use/i],
];

/** { ok, class?, reason }: the licence class of a source's licence words, banned terms first. */
export function classifyLicence(words) {
  const text = String(words ?? '').trim();
  if (!text) return { ok: false, reason: 'unknown licence (no licence words)' };
  for (const b of LICENCES.banned) if (new RegExp(b.pattern, 'i').test(text)) return { ok: false, reason: `banned: ${b.why}` };
  for (const [cls, re] of CLASSES) if (re.test(text)) return { ok: true, class: cls, reason: ALLOWED[cls].name };
  return { ok: false, reason: `unknown licence: "${text.slice(0, 60)}"` };
}
