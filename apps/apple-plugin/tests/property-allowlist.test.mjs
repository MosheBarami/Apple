import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Round 2 of the visual gauntlet: Apple MAX tried to put a sign on a plot and the plugin refused
// "property SizingMode is not in Apple's write allowlist" — while ENUM_ALLOW already accepted
// SurfaceGuiSizingMode. An enum value nothing can be written to is a half-open door.
const source = readFileSync(new URL('../src/Commands.luau', import.meta.url), 'utf8')
  .replace(/--\[\[[\s\S]*?\]\]/g, '')
  .replace(/--[^\n]*/g, '');

function table(name) {
  const m = source.match(new RegExp(`local ${name} = \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(m, `${name} table not found`);
  return new Set([...m[1].matchAll(/([A-Za-z0-9_]+)\s*=\s*true/g)].map((x) => x[1]));
}

const createClasses = table('CREATE_CLASSES');
const propertyAllow = table('PROPERTY_ALLOW');
const readProperties = table('READ_PROPERTIES');
const enumAllow = table('ENUM_ALLOW');
const instanceRef = table('INSTANCE_REF_PROPERTY');

test('every allowed enum named after a creatable class has a writable property to take it', () => {
  const classes = [...createClasses].sort((a, b) => b.length - a.length);
  const pairs = [];
  for (const e of enumAllow) {
    // the class name must end at a word boundary: "ParticleOrientation" is not Part + "icleOrientation"
    const cls = classes.find((c) => e.startsWith(c) && /^[A-Z]/.test(e.slice(c.length)));
    if (!cls) continue;
    const prop = e.slice(cls.length);
    if (instanceRef.has(prop)) continue; // HighlightAdornee names the Adornee reference, not an enum
    if (e === 'PartType') { assert.ok(propertyAllow.has('Shape')); continue; } // Enum.PartType is Part.Shape
    pairs.push([e, prop]);
  }
  assert.ok(pairs.length >= 5, `only ${pairs.length} class-prefixed enums found — the parse is broken`);
  const missing = pairs.filter(([, p]) => !propertyAllow.has(p)).map(([e, p]) => `${e} -> ${p}`);
  assert.deepEqual(missing, [], 'enum accepted but its property cannot be written');
});

test('signs and floating labels can be sized and placed in the world', () => {
  assert.ok(createClasses.has('SurfaceGui') && createClasses.has('BillboardGui'));
  const needed = ['SizingMode', 'PixelsPerStud', 'Face', 'CanvasSize', 'LightInfluence', 'Brightness',
    'AlwaysOnTop', 'StudsOffset', 'StudsOffsetWorldSpace', 'ExtentsOffset', 'MaxDistance'];
  for (const p of needed) {
    assert.ok(propertyAllow.has(p), `${p} is not writable`);
    assert.ok(readProperties.has(p), `${p} is not readable`);
  }
});

test('a wrong enum item is answered with the valid items, so the model can correct itself', () => {
  const fn = source.match(/local function enumValue\([\s\S]*?\nend\n/);
  assert.ok(fn, 'enumValue not found');
  assert.match(fn[0], /GetEnumItems\(\)/, 'the refusal does not list the valid items');
  assert.doesNotMatch(fn[0], /"the requested enum item is unavailable/, 'the refusal names nothing the model can use');
});
