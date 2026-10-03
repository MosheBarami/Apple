/**
 * Shared fixtures for the behaviour tests: a `get_tree`-shaped model built from a compact description, and a fake Studio that
 * answers the ops add_behaviour and model_anatomy use, keeping scripts, creations and deletions in memory so a second call sees
 * what the first one wrote. Every model here is invented for the tests; none is a subject the product is asked to build.
 */

const segText = (name) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `.${name}` : `["${name}"]`);
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** A part: `at` is its centre, `size` its size, `rot` an optional 9-number rotation (rows). */
export function part(name, { at = [0, 0, 0], size = [1, 1, 1], rot = IDENT, anchored = true, material = 'Plastic', color = [0.5, 0.5, 0.5], className = 'Part', props = {}, children = [] } = {}) {
  return {
    name,
    class: className,
    props: {
      Size: { t: 'Vector3', v: size },
      CFrame: { t: 'CFrame', v: [...at, ...rot] },
      Position: { t: 'Vector3', v: at },
      Anchored: { t: 'bool', v: anchored },
      CanCollide: { t: 'bool', v: true },
      Material: { t: 'EnumItem', v: `Enum.Material.${material}` },
      Color: { t: 'Color3', v: color },
      Transparency: { t: 'number', v: 0 },
      ...props,
    },
    children,
  };
}

export const inst = (name, className, props = {}, children = []) => ({ name, class: className, props, children });
/** A joint-like instance whose Part0 / Part1 point at other nodes of the same tree (resolved by `finalize`). */
export const joint = (name, className, a, b) => ({ name, class: className, props: { Part0: { __link: a }, Part1: { __link: b } }, children: [] });

/** Gives every node its path, resolves __link placeholders to instance references (with sibling ordinals where names repeat). */
export function finalize(root, rootPath) {
  const chain = new Map();
  const walk = (n, path, ordinals) => {
    n.path = path;
    chain.set(n, ordinals);
    n.childCount = n.children.length;
    const total = {};
    for (const k of n.children) total[k.name] = (total[k.name] ?? 0) + 1;
    const seen = {};
    for (const k of n.children) {
      seen[k.name] = (seen[k.name] ?? 0) + 1;
      walk(k, `${path}${segText(k.name)}`, [...ordinals, seen[k.name]]);
    }
  };
  // Ordinals in a plugin reference run from the first segment below the service: Workspace's child onward.
  const base = rootPath.split('.').length - 2; // segments below Workspace in the root path, all unique in these fixtures
  walk(root, rootPath, Array(Math.max(0, base)).fill(1));
  const resolve = (n) => {
    for (const [k, v] of Object.entries(n.props)) {
      if (v && typeof v === 'object' && '__link' in v) {
        const target = v.__link;
        const o = chain.get(target);
        const dup = [...chain.keys()].filter((x) => x.path === target.path).length > 1;
        n.props[k] = { t: 'Instance', v: target.path, ...(dup ? { o } : {}) };
      }
    }
    n.children.forEach(resolve);
  };
  resolve(root);
  return root;
}

export const treeData = (root, truncated = false) => ({ root, nodeCount: 1, truncated });

/** A fake Studio over one model. `scripts` maps a script path to its source. */
export function fakeStudio(root, { scripts = new Map(), hash } = {}) {
  const ops = [];
  const find = (path) => {
    const hit = [];
    const walk = (n) => { if (n.path === path) hit.push(n); n.children.forEach(walk); };
    walk(root);
    return hit;
  };
  const studio = {
    ops, root, scripts,
    execStudioOp: async (op) => {
      ops.push(op);
      switch (op.op) {
        case 'get_tree': {
          if (op.root !== root.path) return { id: 'x', ok: false, error: `not found: ${op.root}` };
          return { id: 'x', ok: true, data: treeData(JSON.parse(JSON.stringify(root)), studio.truncated === true) };
        }
        case 'read_script':
          return scripts.has(op.path) ? { id: 'x', ok: true, data: { path: op.path, source: scripts.get(op.path) } } : { id: 'x', ok: false, error: `script not found: ${op.path}` };
        case 'edit_script': {
          if (scripts.has(op.path)) {
            if (typeof op.baseHash !== 'string' || !/^[0-9a-f]{8}$/.test(op.baseHash)) return { id: 'x', ok: false, error: 'baseHash is required for an existing script and must be eight hex characters' };
            if (hash && op.baseHash !== hash(scripts.get(op.path))) return { id: 'x', ok: false, error: 'script changed in Studio since it was read; nothing was written; read it again' };
            if (op.create) return { id: 'x', ok: false, error: 'script already exists; remove create and read it before editing' };
          } else {
            if (!op.create) return { id: 'x', ok: false, error: `script not found: ${op.path}` };
            if (typeof op.baseHash === 'string') return { id: 'x', ok: false, error: 'baseHash is only valid for an existing script' };
            const parent = op.create.parent.startsWith('game.Workspace') ? find(op.create.parent)[0] : null;
            if (parent) {
              const name = op.path.split('.').pop();
              parent.children.push({ name, class: op.create.className, props: {}, children: [], path: op.path, childCount: 0 });
            }
          }
          if (/loadstring|getfenv|setfenv|insertservice|assetservice|loadasset|getobjects|httpservice|requestasync|postasync|debug\./i.test(op.source)) return { id: 'x', ok: false, error: 'script uses a primitive Apple does not write through this command' };
          scripts.set(op.path, op.source);
          return { id: 'x', ok: true, data: { path: op.path, created: !!op.create } };
        }
        case 'delete_instances':
          for (const p of op.paths) scripts.delete(p);
          return { id: 'x', ok: true, data: { deleted: op.paths.length } };
        case 'get_instance': {
          const n = find(op.path);
          if (n.length === 0) return { id: 'x', ok: false, error: `not found: ${op.path}` };
          if (n.length > 1) return { id: 'x', ok: false, error: `path is ambiguous at ${op.path} because ${n.length} siblings are named ${n[0].name}` };
          return { id: 'x', ok: true, data: { path: op.path, name: n[0].name, class: n[0].class, props: n[0].props } };
        }
        default:
          return { id: 'x', ok: false, error: `unexpected op ${op.op}` };
      }
    },
    env: {},
    createCheckpoint: async () => ({ error: 'unused' }),
    addMemoryFact: async () => 'refused',
    studioConnected: () => true,
  };
  return studio;
}

// ------------------------------------------------------------------------------------------ the invented models

/** A small box with a thin cover resting on it and a knob on the cover. Generic names on purpose. */
export function coverModel(name = 'Unit') {
  const body = part('Body', { at: [0, 0.5, 0], size: [4, 1, 3], material: 'Wood' });
  const cover = part('Cover', { at: [0, 1.2, 0], size: [4, 0.4, 3], material: 'Wood' });
  const knob = part('Knob', { at: [0, 1.5, 1.4], size: [0.4, 0.4, 0.4], material: 'Metal' });
  const weld = joint('Hold', 'WeldConstraint', cover, knob);
  cover.children.push(weld);
  const hinge = joint('Seam', 'Weld', body, cover);
  body.children.push(hinge);
  const root = inst(name, 'Model', { PrimaryPart: { __link: body } }, [body, cover, knob]);
  return { root: finalize(root, `game.Workspace.${name}`), body, cover, knob };
}

/** A tall thin leaf standing between two posts, none of them touching anything else. */
export function leafModel(name = 'Gateway') {
  const left = part('Post', { at: [-3, 3, 0], size: [1, 6, 1] });
  const right = part('Post', { at: [3, 3, 0], size: [1, 6, 1] });
  const leaf = part('Leaf', { at: [0, 3, 0], size: [5, 5.5, 0.4] });
  const root = inst(name, 'Model', {}, [left, right, leaf]);
  return { root: finalize(root, `game.Workspace.${name}`), left, right, leaf };
}

/** Parts with the generic names a stripped library model has, two of them sharing a name. */
export function anonymousModel(name = 'Piece') {
  const a = part('Part', { at: [0, 0.5, 0], size: [6, 1, 6] });
  const b = part('Part', { at: [0, 1.5, 0], size: [2, 1, 2] });
  const c = part('MeshPart', { at: [0, 2.5, 0], size: [1, 1, 1], className: 'MeshPart' });
  const root = inst(name, 'Model', {}, [a, b, c]);
  return { root: finalize(root, `game.Workspace.${name}`), a, b, c };
}
