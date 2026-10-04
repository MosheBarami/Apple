// A stand-in for the paired Studio plugin, for the tools that build from the owner's saved games.
//
// It is a small world (a flat ground, optional walls and invisible zones, a spawn) plus the operations those tools send:
// the library routes, imports, tree reads, spatial queries, transforms, clones and script reads. It keeps a log of every
// operation and answers the way the real plugin does (apps/studpilot-plugin/src/ops/Query.luau and Commands.luau), so a test can
// check what the tools ASKED and what the world looks like afterwards, not only what they returned.

const CLASS_PARENTS = { TextButton: 'GuiButton', ImageButton: 'GuiButton', Script: 'LuaSourceContainer', LocalScript: 'LuaSourceContainer', ModuleScript: 'LuaSourceContainer', ScreenGui: 'LayerCollector', BillboardGui: 'LayerCollector', SurfaceGui: 'LayerCollector' };
const isA = (cls, target) => { for (let c = cls; c; c = CLASS_PARENTS[c]) if (c === target) return true; return false; };
const last = (path) => path.split('.').pop();
/** query_instances.property {name, op, value}: eq is the whole value, contains is a case-insensitive part of it. */
const propMatches = (n, p) => { const v = n.props?.[p.name]; if (v === undefined) return false; const t = String(v?.v ?? v).toLowerCase(), w = String(p.value).toLowerCase(); return (p.op ?? 'eq') === 'contains' ? t.includes(w) : t === w; };
const lastSlash = (path) => path.split('/').filter(Boolean).pop() ?? '';

/**
 * @param {object} o
 * @param {Record<string, unknown>} [o.route]     route name -> data, or (op) => reply
 * @param {(op: object) => object | null} [o.importOf]   per import: { roots:[{name,class,center,size,children:[{name,class}] ,scripts:[{name,class,source}]}], scripts, suspicious }
 * @param {object[]} [o.walls]   [{ center:[x,y,z], size:[x,y,z] }] solid: rays land on them, models cannot overlap them
 * @param {object[]} [o.ghosts]  same, but invisible to rays (a trigger zone): only the overlap check sees them
 * @param {string[]} [o.workspace]  names the place's Workspace holds at the start
 * @param {object | ((op: object) => object)} [o.game]     what a game breakdown (query_owner_library action game) answers
 * @param {(op: object, n: number) => object | Error} [o.play]   the plugin's play_check / play_check_ui report for the n-th session (1-based); an Error is a refused session
 * @param {Record<string, object>} [o.layout]    ui_layout_check answers by screen path (default: a pass)
 * @param {(op: object) => object | null} [o.fail]  return a reply to override an op's answer
 */
export function fakeStudio(o = {}) {
  const ground = o.ground ?? 0;
  const nodes = new Map();
  const log = [];
  let counter = 0;
  const add = (path, props = {}) => { const n = { path, name: last(path), parent: path.slice(0, path.lastIndexOf('.')), class: 'Model', attrs: {}, ...props }; nodes.set(path, n); return n; };
  for (const s of ['Workspace', 'Lighting', 'ReplicatedStorage', 'ServerScriptService', 'StarterGui', 'SoundService', 'MaterialService', 'ServerStorage', 'StarterPlayer', 'ReplicatedFirst', 'StarterPack', 'Teams']) add('game.' + s, { class: s, parent: 'game' });
  add('game.StarterPlayer.StarterPlayerScripts', { class: 'StarterPlayerScripts', parent: 'game.StarterPlayer' });
  add('game.StarterPlayer.StarterCharacterScripts', { class: 'StarterCharacterScripts', parent: 'game.StarterPlayer' });
  for (const name of o.workspace ?? ['Baseplate', 'SpawnLocation']) add('game.Workspace.' + name, { class: name === 'SpawnLocation' ? 'SpawnLocation' : 'Part', center: name === 'SpawnLocation' ? [0, ground + 0.5, 0] : [0, ground - 10, 0], size: name === 'SpawnLocation' ? [12, 1, 12] : [512, 20, 512] });
  const walls = o.walls ?? [], ghosts = o.ghosts ?? [];
  const kids = (path) => [...nodes.values()].filter((n) => n.parent === path);
  const under = (path) => [...nodes.values()].filter((n) => n.path.startsWith(path + '.'));
  const remove = (path) => { for (const n of [...nodes.values()]) if (n.path === path || n.path.startsWith(path + '.')) nodes.delete(n.path); };
  const box = (n) => ({ lo: n.center.map((c, i) => c - n.size[i] / 2), hi: n.center.map((c, i) => c + n.size[i] / 2) });
  const wallBox = (w) => ({ lo: w.center.map((c, i) => c - w.size[i] / 2), hi: w.center.map((c, i) => c + w.size[i] / 2) });
  const overlap = (a, b) => [0, 1, 2].every((i) => Math.min(a.hi[i], b.hi[i]) - Math.max(a.lo[i], b.lo[i]) > 0.05);
  const models = (except) => [...nodes.values()].filter((n) => n.center && n.path.startsWith('game.Workspace.') && !except.includes(n.path) && n.class !== 'SpawnLocation' && n.name !== 'Baseplate');
  const ok = (data = {}) => ({ ok: true, data });
  const no = (error, failure) => ({ ok: false, error, ...(failure ? { failure } : {}) });
  const world = { nodes, log, add, kids, under, get sessions() { return sessions; } };

  let sessions = 0;
  const playSession = (op) => {
    sessions += 1;
    const r = o.play?.(op, sessions);
    if (r === undefined) return no(op.op + ' is not supported by this stand-in');
    return r instanceof Error ? no(r.message) : ok(r);
  };
  const handlers = {
    query_owner_library(op) {
      if (op.action === 'route') { const r = o.route?.[op.route]; return typeof r === 'function' ? r(op) : r === undefined ? no('unknown route ' + op.route) : r instanceof Error ? no(r.message) : ok(r); }
      if (op.action === 'deps') return ok({ needs: [], usedBy: [] });
      return ok(typeof o.game === 'function' ? o.game(op) : o.game ?? { name: 'Game', place: true, services: {} });
    },
    import_owner_library(op) {
      const parent = nodes.get(op.parent);
      if (!parent) return no('instance not found at ' + op.parent, 'not_found');
      const cfg = o.importOf?.(op) ?? {};
      if (cfg.error) return no(cfg.error, cfg.failure);
      if (op.replace) for (const c of kids(op.parent)) if (c.class !== 'Terrain' && c.class !== 'Camera') remove(c.path);
      const roots = cfg.roots ?? [{ name: lastSlash(op.path) || 'Root', class: 'Model', center: [300, -40, 300], size: [4, 4, 4] }];
      const inserted = [];
      let skipped = 0;
      for (const r of roots) {
        if (op.onlyMissing && [...kids(op.parent)].some((c) => c.name === r.name)) { skipped += 1; continue; }
        const path = op.parent + '.' + r.name;
        add(path, { class: r.class ?? 'Model', center: r.center, size: r.size, attrs: { AppleLibraryGame: op.gameId, AppleLibraryPath: op.path } });
        for (const c of r.children ?? []) { add(path + '.' + c.name, { class: c.class ?? 'Frame', props: c.props }); for (const g of c.children ?? []) add(path + '.' + c.name + '.' + g.name, { class: g.class ?? 'TextLabel', props: g.props }); }
        for (const s of r.scripts ?? []) add(path + '.' + s.name, { class: s.class ?? 'LocalScript', source: s.source ?? '' });
        inserted.push(path);
      }
      return ok({ inserted, roots: roots.length, instances: 5 * roots.length, scripts: cfg.scripts ?? 0, suspicious: cfg.suspicious ?? [], serviceApplied: [], removed: 0, ...(skipped ? { skipped } : {}), parent: op.parent });
    },
    get_tree(op) {
      const n = nodes.get(op.root);
      if (!n) return no('instance not found at ' + op.root, 'not_found');
      // Like the plugin: properties and attributes on every node, children down to maxDepth (default 1), moreChildren where it stops.
      const depth = op.maxDepth ?? 1, limit = op.maxNodes ?? Infinity;
      let count = 0, cut = false;
      const view = (x, d) => {
        count += 1;
        const cs = kids(x.path);
        const out = { path: x.path, name: x.name, class: x.class, childCount: cs.length };
        if (x.props) out.props = x.props;
        if (x.attrs && Object.keys(x.attrs).length) out.attributes = x.attrs;
        if (d < depth) {
          out.children = [];
          for (const c of cs) {
            if (count >= limit) { out.truncated = true; cut = true; break; }
            out.children.push(view(c, d + 1));
          }
        } else if (cs.length) out.moreChildren = cs.length;
        return out;
      };
      const root = view(n, 0);
      return ok({ root, nodeCount: count, truncated: cut });
    },
    play_check(op) { return playSession(op); },
    play_check_ui(op) { return playSession(op); },
    ui_layout_check(op) {
      if (!nodes.has(op.screen)) return no('instance not found at ' + op.screen, 'not_found');
      return ok(o.layout?.[op.screen] ?? { screen: op.screen, devices: [{ device: 'desktop', size: [1920, 1080], elements: 1, issues: [] }], issues: 0, verdict: 'pass' });
    },
    create_instances(op) { for (const i of op.items) add(i.parent + '.' + i.name, { class: i.className }); return ok({ created: op.items.length }); },
    spatial_query(op) {
      if (op.action === 'bounds' || op.action === 'check_placement') {
        const n = nodes.get(op.path);
        if (!n) return no('not found', 'not_found');
        if (!n.center) return no('target is not a Model or Part', 'invalid');
        const b = box(n);
        const data = { action: op.action, path: n.path, center: n.center, size: n.size, bottomY: b.lo[1], topY: b.hi[1] };
        if (op.action === 'bounds') return ok(data);
        const hits = [...walls.map((w, i) => ({ box: wallBox(w), path: 'game.Workspace.Wall' + i })), ...ghosts.map((w, i) => ({ box: wallBox(w), path: 'game.Workspace.Zone' + i })), ...models([n.path]).map((m) => ({ box: box(m), path: m.path }))].filter((x) => overlap(b, x.box));
        return ok({ ...data, overlapping: hits.map((h) => h.path), overlapCount: hits.length, ground: { hit: true }, gapBelow: b.lo[1] - ground, floating: b.lo[1] - ground > 0.5 });
      }
      if (op.action === 'find_ground') {
        const [x, top, z] = op.position;
        const solids = [...walls.map(wallBox), ...models(op.exclude ?? []).map(box)];
        const heights = [ground, ...solids.filter((s) => x >= s.lo[0] && x <= s.hi[0] && z >= s.lo[2] && z <= s.hi[2] && s.hi[1] <= top).map((s) => s.hi[1])];
        const y = Math.max(...heights);
        return ok({ action: 'find_ground', result: { hit: true, position: [x, y, z], normal: [0, 1, 0], material: 'Enum.Material.Grass', distance: top - y } });
      }
      return no('unsupported spatial action');
    },
    transform_instances(op) {
      for (const p of op.paths) { const n = nodes.get(p); if (!n) return no(p + ' not found', 'not_found'); if (!n.center) return no(p + ': not spatial', 'invalid'); }
      for (const p of op.paths) { const n = nodes.get(p); if (op.move) n.center = n.center.map((c, i) => c + op.move[i]); if (op.rotate) n.yaw = (n.yaw ?? 0) + op.rotate[1]; }
      return ok({ transformed: op.paths.length, moved: !!op.move, rotated: !!op.rotate });
    },
    clone_instances(op) {
      const created = [];
      for (const p of op.paths) {
        const n = nodes.get(p);
        if (!n) return no(p + ' not found', 'not_found');
        const path = `${n.parent}.${n.name.replace(/ \(\d+\)$/, '')} (${++counter + 1})`;
        add(path, { class: n.class, center: n.center && [...n.center], size: n.size, attrs: { ...n.attrs } });
        created.push(path);
      }
      return ok({ created, count: created.length });
    },
    delete_instances(op) { for (const p of op.paths) if (!nodes.has(p)) return no(p + ' not found', 'not_found'); for (const p of op.paths) remove(p); return ok({ deleted: op.paths.length }); },
    query_instances(op) {
      const root = op.root ?? 'game';
      const found = under(root).filter((n) => (!op.className || n.class === op.className) && (!op.isA || isA(n.class, op.isA)) && (!op.name || n.name.toLowerCase().includes(op.name.toLowerCase().replace(/\*/g, ''))) && (!op.property || propMatches(n, op.property))).slice(0, op.limit ?? 50);
      return ok({ matches: found.map((n) => ({ path: n.path, className: n.class })), count: found.length });
    },
    dump_scripts(op) { return ok({ scripts: under(op.root ?? 'game').filter((n) => isA(n.class, 'LuaSourceContainer')).map((n) => ({ path: n.path, class: n.class, source: n.source ?? '' })) }); },
    search_scripts(op) {
      const matches = [];
      for (const n of nodes.values()) if (isA(n.class, 'LuaSourceContainer') && (n.source ?? '').includes(op.query)) matches.push({ path: n.path, line: 1, text: (n.source ?? '').split('\n').find((l) => l.includes(op.query)) });
      return ok({ query: op.query, matches: matches.slice(0, op.maxResults ?? 40) });
    },
    read_script(op) { const n = nodes.get(op.path); return n && isA(n.class, 'LuaSourceContainer') ? ok({ path: n.path, class: n.class, source: n.source ?? '' }) : no('not found', 'not_found'); },
    edit_script(op) { if (op.create) add(op.path, { class: op.create.className, source: op.source }); else nodes.get(op.path).source = op.source; return ok({}); },
    set_props(op) { const n = nodes.get(op.path); if (!n) return no('not found', 'not_found'); for (const [k, v] of Object.entries(op.attributes ?? {})) n.attrs[k] = v.v; for (const [k, v] of Object.entries(op.props ?? {})) (n.props ??= {})[k] = v; return ok({}); },
    get_instance(op) { const n = nodes.get(op.path); return n ? ok({ path: n.path, name: n.name, class: n.class, childCount: kids(n.path).length, props: n.props ?? {}, attributes: n.attrs }) : no('instance not found at ' + op.path, 'not_found'); },
    snapshot() { return ok({}); },
  };

  const ctx = {
    env: {}, userId: 'owner', localOwnerGateway: true,
    studioConnected: () => true,
    checkpoints: [],
    createCheckpoint: async (label) => { ctx.checkpoints.push(label); return { id: 'cp' }; },
    execStudioOp: async (op) => {
      log.push(op);
      const forced = o.fail?.(op);
      if (forced) return forced;
      const h = handlers[op.op];
      return h ? h(op) : no(`${op.op} is not supported by this stand-in`);
    },
  };
  return { ctx, world, log, ops: (name) => log.filter((op) => op.op === name) };
}
