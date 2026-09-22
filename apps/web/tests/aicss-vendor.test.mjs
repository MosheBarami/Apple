import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(WEB, 'src', 'components', 'aicss');
const UPSTREAM_COMMIT = 'a78d3c308d10972e5196331162c5c2c870b1a69f';

// Intentional exact-fidelity tripwire. These are Git blob ids from the public
// MIT source at UPSTREAM_COMMIT. A source or CSS edit should fail loudly until
// the vendored upstream revision and attribution are deliberately updated.
const UPSTREAM_BLOBS = {
  'css.d.ts': 'c65e67a2963e7c87c164de3e129daea8ba20af2f',
  'data-table/DataTable.module.css': '615fa074be84fef97db2cd82bfdf5df05fc7c51c',
  'data-table/DataTable.tsx': '5d36c5044de4a31ab6b597a1301489ccdde8ffc7',
  'data-table/index.ts': '4cb9855d0f8c975e1b1e3cdfc300eb31ec44a0e5',
  LICENSE: '097f32e77870e2466ceab4b7143061dca80777c2',
};

// The newer free components are public through the unauthenticated AICSS
// registry rather than this Git snapshot. These SHA-256 values pin the exact
// TSX/CSS bytes returned by the live registry on 2026-09-22.
const PUBLIC_REGISTRY_SHA256 = {
  'comparison-table/ComparisonTable.tsx': 'df562b23d9ea26e790896a37321fce65f7cb267eb1f0576acc233d82f9415808',
  'comparison-table/ComparisonTable.module.css': '7c843ce59ad0f0d82b4e7fe14bcda1fb329d7e26f3abccd55c506c74a003baf3',
};

// THE COMPONENTS THAT ARE STILL VENDORED, derived from what the app still imports rather than
// listed twice: every directory here must be imported by some file under src/, and every
// directory on disk must be here (the test below checks both directions).
const COMPONENT_DIRS = ['comparison-table', 'data-table'];

// REMOVED 2026-09-22, when the chat, thinking and workspace surfaces moved to Vercel AI Elements
// and these became imported by nothing (UPSTREAM.md, "Removed on 2026-09-22"). The pins are kept
// as the record of exactly which bytes were vendored, so the removal is a recorded fact and a
// directory that comes back under one of these names is caught rather than trusted.
const REMOVED = {
  'thinking-state': {
    'ThinkingState.module.css': '27b18d189d2ba5f6073638d145732fe7daa36a0b',
    'ThinkingState.tsx': '71ac1081af2f7fad670de5ead90f2cc40111d158',
    'index.ts': 'edc9c27c0306c4c48cad3d9500ab467bdb0fb2ff',
  },
  'thinking-reasoning': {
    'ThinkingReasoning.module.css': '45707caf53ae43c29bbd3aebeba98bd9d69f719f',
    'ThinkingReasoning.tsx': 'd34f6921e002b1be61fce5a692d7d4c0dfb32d22',
    'index.ts': '32a4b9ef619bacda3e7f217525e4b2f513214c3e',
  },
  orbs: {
    'Orb.module.css': 'db18ddd5ea44071da1aeae3fd5f757d7cf6f97c5',
    'Orb.tsx': 'b204b3f7487fd507e058e4eca2b9a560d6a2c8d8',
    'index.ts': '1199a23f6098ba7681cc20fa08479be6173b1a45',
  },
  'text-response': {
    'TextResponse.module.css': '7b809f53a0a9aa60d7eec807e8e43912f371592c',
    'TextResponse.tsx': 'ceb29db6f2df2a1dafdf0c1b487754996ba5af30',
    'index.ts': '2b57086972b0d9187ba96b9e29b27e5f7666e4dc',
  },
  'streaming-text': {
    'StreamingText.module.css': '05342294597754fef4dbe6d5e8675f9b55532f43',
    'StreamingText.tsx': '432a2cb06279b9489c3b511368afd2f7fe307004',
    'index.ts': '7d738202c76a412e0a088f1986849091b16d8b5d',
  },
  'code-block': {
    'CodeBlock.module.css': '8d2914861cf59a8c7993e69657876af1590ad154',
    'CodeBlock.tsx': 'c715bac5d617081241b6879eb28fd16bdbd69a0a',
    'index.ts': 'ca111193d822e54010329393ca6991cc9be83cbb',
  },
  // Registry snapshots (SHA-256, not blob ids).
  'file-diff': {
    'FileDiff.tsx': 'f4884a04a03b2a1510fcc978eee3d6ee075b29cc4e9c17670db329e471d0a32b',
    'FileDiff.module.css': '09f6050aca49a16ce946bf86365f7aca3deb1ad813dbca4bae02d7ff7451925b',
  },
  'inline-citations': {
    'InlineCitations.tsx': 'a0919aecd8b111bb8305e40d54cce18a73bae406a081545f4b7297fca2596ca5',
    'InlineCitations.module.css': '27fd8824d5dd5b3bdc3f3b3de9c73ebe22e09e2bf109eaa2f2752c41f0671e2e',
  },
};

const REQUESTED_LICENSE_BLOCKED = ['ai-agent-input', 'image-generation', 'task-list'];
const PRO_LOCKED = [...REQUESTED_LICENSE_BLOCKED, 'approval-card', 'audio-waves'];

function gitBlobId(path) {
  const bytes = readFileSync(join(VENDOR, path));
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(join(VENDOR, path))).digest('hex');
}

test('vendored AICSS source is byte-for-byte the pinned public package source', () => {
  // Every vendored file on disk carries a pin, read from the directory rather than from this list —
  // so the manifest cannot quietly cover less than what ships. UPSTREAM.md and the root barrel are
  // local files, not vendored ones.
  const onDisk = [];
  const collect = (dir, prefix = '') => {
    for (const entry of readdirSync(dir)) {
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(join(dir, entry)).isDirectory()) collect(join(dir, entry), rel);
      else if (rel !== 'UPSTREAM.md' && rel !== 'index.ts') onDisk.push(rel);
    }
  };
  collect(VENDOR);
  assert.ok(onDisk.length >= 8, `only ${onDisk.length} vendored file(s) found — the walk is not reading`);
  for (const rel of onDisk) {
    if (rel in UPSTREAM_BLOBS || rel in PUBLIC_REGISTRY_SHA256) continue;
    // A registry component's index.ts is local (UPSTREAM.md: "only re-export the copied
    // components"), so it has no upstream bytes to pin — it is held to being nothing but that.
    const dir = rel.split('/')[0];
    const registryDir = Object.keys(PUBLIC_REGISTRY_SHA256).some((path) => path.startsWith(`${dir}/`));
    assert.ok(registryDir && rel === `${dir}/index.ts`, `${rel} ships with no fidelity pin`);
    const lines = readFileSync(join(VENDOR, rel), 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
    assert.ok(lines.length > 0 && lines.every((line) => /^export (?:\*|\{[^}]*\}) from ["']\.\/[\w-]+["'];?$/.test(line)),
      `${rel} is a local file and may only re-export its component`);
  }
  for (const [path, expected] of Object.entries(UPSTREAM_BLOBS)) {
    assert.equal(gitBlobId(path), expected, `${path} differs from AICSS ${UPSTREAM_COMMIT}`);
  }
});

test('newer free registry components keep the exact public TSX and CSS bytes', () => {
  for (const [path, expected] of Object.entries(PUBLIC_REGISTRY_SHA256)) {
    assert.equal(sha256(path), expected, `${path} differs from the public AICSS registry snapshot`);
  }
});

/** Every `components/aicss/<dir>` a source file imports, comments stripped. */
function importedAicssDirs() {
  const found = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (path === VENDOR) continue;
        walk(path);
      } else if (/\.(?:ts|tsx)$/.test(entry)) {
        const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
        // Named (`from '…'`), bare (`import '…'`) and dynamic (`import('…')`) imports alike.
        for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"][^'"]*\/aicss\/([^/'"]+)/g)) {
          found.set(m[1], [...(found.get(m[1]) ?? []), path.slice(WEB.length + 1)]);
        }
      }
    }
  };
  walk(join(WEB, 'src'));
  return found;
}

test('the vendor holds exactly the AICSS components the app still imports', () => {
  const actual = readdirSync(VENDOR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actual, COMPONENT_DIRS);
  const imported = importedAicssDirs();
  assert.ok(imported.size > 0, 'the import reader found no AICSS import at all — it is not reading');
  assert.deepEqual([...imported.keys()].sort(), COMPONENT_DIRS,
    'a vendored component nothing imports is dead code; an imported one that is not vendored is a broken import');
});

test('every removed AICSS component is absent, recorded, and imported by nothing', () => {
  const upstream = readFileSync(join(VENDOR, 'UPSTREAM.md'), 'utf8');
  const removal = upstream.slice(upstream.indexOf('## Removed on 2026-09-22'));
  assert.ok(removal.length > 100, 'UPSTREAM.md does not record the removal');
  const names = Object.keys(REMOVED);
  assert.equal(names.length, 8, 'the record of removed directories changed — review it rather than editing the count');
  const imported = importedAicssDirs();
  for (const dir of names) {
    assert.equal(existsSync(join(VENDOR, dir)), false, `${dir} was removed and has come back`);
    assert.ok(removal.includes(`| \`${dir}\``), `${dir} is not in UPSTREAM.md's removal table`);
    assert.equal(imported.has(dir), false, `${dir} is imported by ${imported.get(dir)} but no longer vendored`);
    assert.ok(Object.keys(REMOVED[dir]).length >= 2, `${dir}: its pinned bytes are no longer recorded`);
  }
  const barrel = readFileSync(join(VENDOR, 'index.ts'), 'utf8');
  for (const dir of names) assert.doesNotMatch(barrel, new RegExp(`["']\\./${dir}["']`), `the barrel still exports ${dir}`);
});

test('the barrel exports every vendored component and no license-blocked slug', () => {
  const barrel = readFileSync(join(VENDOR, 'index.ts'), 'utf8');
  for (const dir of COMPONENT_DIRS) {
    assert.match(barrel, new RegExp(`export \\* from ["']\\./${dir}["']`), `missing barrel export for ${dir}`);
  }
  for (const dir of PRO_LOCKED) {
    assert.equal(existsSync(join(VENDOR, dir)), false, `${dir} is currently Pro-locked and must not be vendored`);
    assert.doesNotMatch(barrel, new RegExp(`["']\\./${dir}["']`));
  }
});

test('the MIT license and upstream attribution stay beside the vendored source', () => {
  const license = readFileSync(join(VENDOR, 'LICENSE'), 'utf8');
  const notice = readFileSync(join(VENDOR, 'UPSTREAM.md'), 'utf8');

  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 AICSS/);
  assert.match(notice, /github\.com\/kvnkld\/aicss/);
  assert.match(notice, new RegExp(UPSTREAM_COMMIT));
  assert.match(notice, /MIT license/i);
  for (const dir of REQUESTED_LICENSE_BLOCKED) {
    assert.ok(
      notice.includes(`| \`${dir}\` | license-blocked |`),
      `${dir} has no recorded license-blocked disposition`,
    );
  }
  assert.match(notice, /audio-waves[^\n]*approval-card|approval-card[^\n]*audio-waves/);
});
