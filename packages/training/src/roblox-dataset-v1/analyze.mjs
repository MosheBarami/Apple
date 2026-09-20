// Static analysis only. Never evaluate, require, or run harvested Luau.
// Line-oriented IPC keeps raw samples out of the terminal transcript.
import readline from 'node:readline';
import { analyzeLuau, stripComments, blankStringContents } from '../../../evals/src/roblox-antipatterns.mjs';

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  let id = null;
  try {
    const item = JSON.parse(line);
    id = item.id;
    if (typeof item.code !== 'string' || item.code.length > 400_000) throw new Error('invalid_code_input');
    const stripped = stripComments(item.code);
    const bare = blankStringContents(stripped);
    const result = analyzeLuau(item.code);
    const dangerous = [
      ['executor_environment', /\b(?:getgenv|getrenv|hookmetamethod|hookfunction|getrawmetatable|setreadonly|sethiddenproperty|gethiddenproperty|queue_on_teleport|firetouchinterest|fireclickdetector)\s*\(/],
      ['dynamic_code_loader', /\bloadstring\s*\(/],
      ['numeric_remote_require', /\brequire\s*\(\s*\d/],
      ['executor_request', /\bsyn\.(?:request|crypt)|\bidentifyexecutor\s*\(/],
    ].filter(([, re]) => re.test(bare)).map(([name]) => name);
    const requirements = [...stripped.matchAll(/\brequire\s*\(([^\n)]{1,240})\)/g)].map(m => m[1]);
    const services = [...stripped.matchAll(/\b(?:game|Game)\s*:\s*GetService\s*\(\s*["']([A-Za-z][A-Za-z0-9_]*)["']/g)].map(m => m[1]);
    const classes = [...stripped.matchAll(/\bInstance\s*\.\s*new\s*\(\s*["']([A-Za-z][A-Za-z0-9_]*)["']/g)].map(m => m[1]);
    const enums = [...bare.matchAll(/\bEnum\.([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)/g)].map(m => `${m[1]}.${m[2]}`);
    const unsupportedLua = /\b(?:io|package)\s*\.|\bos\.(?:execute|remove|rename|exit)\s*\(/.test(bare);
    const stub = /\b(?:TODO|FIXME|IMPLEMENT_ME)\b|\b(?:your code here|implement (?:this|here)|placeholder implementation)\b/i.test(item.code);
    process.stdout.write(JSON.stringify({
      id, available: true, context: result.context,
      errors: result.findings.filter(f => f.severity === 'error').map(f => ({ rule: f.rule, line: f.line })),
      warnings: result.findings.filter(f => f.severity === 'warn').map(f => ({ rule: f.rule, line: f.line })),
      rules_run: result.ruleIds, rules_skipped: result.skipped, dangerous,
      services: [...new Set(services)], classes: [...new Set(classes)], enums: [...new Set(enums)],
      require_count: requirements.length,
      engine_dependent: /\b(?:game|workspace|Instance|Enum|CFrame|Vector3|UDim2|Color3)\b/.test(bare),
      unsupported_standard_lua: unsupportedLua, stub_marker: stub,
      has_function: /\bfunction\b/.test(bare),
    }) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ id, available: false, reason: e instanceof Error ? e.name : 'analysis_error' }) + '\n');
  }
}
