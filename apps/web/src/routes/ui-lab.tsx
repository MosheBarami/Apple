// /ui-lab — the generative-UI specimen book.
//
// Every approved block type rendered with representative product data, plus the
// rejection cases, so the component set is reviewable without waiting for an
// agent to emit one. This is also the fastest way to see that a hostile document
// produces the safe fallback rather than markup.
import { useMemo, useState } from 'react';
import { GenerativeUIPanel } from '../lib/generative-ui/render';
import { BLOCK_TYPES } from '../lib/generative-ui/schema';
import { validateDocument } from '../lib/generative-ui/validate';
import { mockRender } from '../lib/mock';
import { EmptyState } from '../components/empty-state';
import { EMPTY_STATES, M06_NOT_MODELLED, type EmptyStateName } from '../components/empty-state-model';
import { StatusIcon } from '../components/status-icon';
import { STATUS, type StatusName } from '../components/status-icon-model';
import { useToast } from '../components/toast';
import { createUndoable, UNDO_WINDOW_MS } from '../lib/undo';

interface Specimen {
  id: string;
  name: string;
  note: string;
  input: unknown;
  invalid?: boolean;
}

function useSpecimens(): Specimen[] {
  return useMemo(() => {
    const img = (view: string, variant: 'before' | 'after' = 'after') => ({
      src: mockRender(view, variant),
      alt: `${view} view of the lobby`,
      width: 320,
      height: 200,
    });

    const one = (name: string, note: string, block: unknown, title?: string): Specimen => ({
      id: name,
      name,
      note,
      input: { v: 1, blocks: [block], title },
    });

    return [
      one('heading + text + list', 'Primitives. Tone comes from a closed enum, never a colour value.', {
        type: 'heading',
        text: 'What changed in the lobby',
        level: 3,
      }),
      one('text', 'Body copy. Raw HTML in this field is escaped, never parsed.', {
        type: 'text',
        text: 'The portal now reads a TargetPlace attribute, so pointing it elsewhere needs no script edit.',
      }),
      one('list', 'Ordered or unordered, bounded at 120 items.', {
        type: 'list',
        ordered: true,
        items: [
          'Raised the plinth to 3 studs and split the floor into tiles',
          'Added four PointLights at 8 studs, Brightness 2.4',
          'Wired PortalService with a 2s per-player debounce',
        ],
      }),
      one('table', 'Row width is checked against the column count.', {
        type: 'table',
        caption: 'Materials in the lobby after the pass',
        columns: ['Material', 'Parts', 'Share'],
        rows: [
          ['Concrete', '61', '47%'],
          ['Plastic', '49', '38%'],
          ['Neon', '18', '14%'],
        ],
      }),
      one('callout', 'Tone token drives the colour. Links are scheme-checked.', {
        type: 'callout',
        tone: 'warn',
        title: 'Studio was in Run mode',
        text: 'Changes made during a playtest are discarded when you stop. Apple paused until you returned to Edit.',
        link: { href: 'https://create.roblox.com/docs/studio/testing-modes', label: 'Roblox testing modes' },
      }),
      one('metric', 'A single number that matters.', {
        type: 'metric',
        label: 'Subject coverage',
        value: '31',
        unit: '%',
        tone: 'good',
        delta: '+12 since the last render',
        hint: 'Under 4% in every frame is a hard fail.',
      }),
      one('key_values', 'Compact fact list.', {
        type: 'key_values',
        title: 'Lighting configuration',
        items: [
          { key: 'Brightness', value: '2.4' },
          { key: 'ClockTime', value: '17.2' },
          { key: 'Light instances', value: '6', tone: 'good' },
          { key: 'Effects', value: 'Atmosphere, Sky, BloomEffect' },
        ],
      }),
      one('code_diff', 'Luau changes with line numbers and add/remove counts.', {
        type: 'code_diff',
        path: 'ServerScriptService.PortalService',
        language: 'luau',
        summary: 'Debounce the teleport per player instead of globally.',
        hunks: [
          {
            header: '@@ -18,7 +18,9 @@ function onTouched(hit)',
            lines: [
              { kind: 'ctx', n: 18, text: 'local function onTouched(hit)' },
              { kind: 'del', n: 19, text: '\tif debounce then return end' },
              { kind: 'del', n: 20, text: '\tdebounce = true' },
              { kind: 'add', n: 19, text: '\tlocal player = Players:GetPlayerFromCharacter(hit.Parent)' },
              { kind: 'add', n: 20, text: '\tif not player or cooling[player] then return end' },
              { kind: 'add', n: 21, text: '\tcooling[player] = true' },
              { kind: 'ctx', n: 22, text: '' },
              { kind: 'ctx', n: 23, text: '\tTeleportService:Teleport(target, player)' },
            ],
          },
        ],
      }),
      one('scene_comparison', 'Before/after wipe. Drag the handle or use the arrow keys.', {
        type: 'scene_comparison',
        title: 'game.Workspace.Lobby',
        before: {
          label: 'Before',
          image: img('hero', 'before'),
          stats: [
            { key: 'Coverage', value: '24%' },
            { key: 'Colours', value: '9' },
          ],
        },
        after: {
          label: 'After',
          image: img('hero', 'after'),
          stats: [
            { key: 'Coverage', value: '31%', tone: 'good' },
            { key: 'Colours', value: '14', tone: 'good' },
          ],
        },
        note: 'The floor split into tiles and two planters were added between the pillars.',
      }),
      one('render_review', 'Multi-view render viewer with per-view measurements.', {
        type: 'render_review',
        subject: 'game.Workspace.Lobby',
        summary: 'Bounds 86 × 24 × 74 studs · 5 views',
        score: 8.1,
        passed: true,
        views: [
          { name: 'hero', image: img('hero'), coverage: 0.31, partsVisible: 96, partsOffCamera: 4, distinctColours: 14 },
          { name: 'front', image: img('front'), coverage: 0.29, partsVisible: 92, partsOffCamera: 6, distinctColours: 13 },
          { name: 'side', image: img('side'), coverage: 0.27, partsVisible: 88, partsOffCamera: 9, distinctColours: 12 },
          { name: 'top', image: img('top'), coverage: 0.44, partsVisible: 118, partsOffCamera: 0, distinctColours: 14 },
          { name: 'eye', image: img('eye'), coverage: 0.19, partsVisible: 61, partsOffCamera: 22, distinctColours: 11 },
        ],
        lighting: [
          { key: 'Brightness', value: '2.4' },
          { key: 'ClockTime', value: '17.2' },
          { key: 'Light instances', value: '6' },
        ],
      }),
      one('visual_critique', 'The quality gate: score, verdict, and named defects with fixes.', {
        type: 'visual_critique',
        score: 6.5,
        passed: false,
        summary:
          'The portal reads clearly from the hero angle and the lighting has real warmth. The floor is still a single flat plate.',
        hardFails: [],
        defects: [
          {
            view: 'top',
            dimension: 'composition',
            severity: 'major',
            observed: 'Two thirds of the lobby footprint is bare floor with nothing on it.',
            fix: 'Add a seating cluster and two planters between the pillars.',
          },
          {
            view: 'hero',
            dimension: 'materials',
            severity: 'minor',
            observed: 'The floor plate is one uniform Concrete slab.',
            fix: 'Split the floor into 4×4 tiles and alternate two BrickColors.',
          },
        ],
      }),
      one('visual_critique (unavailable)', 'A tooling fault is a null score, never a zero.', {
        type: 'visual_critique',
        score: null,
        passed: false,
        unavailable: true,
        summary: 'The critique response could not be parsed.',
        defects: [],
        hardFails: [],
      }),
      one('property_inspector', 'Instance properties with the changed values called out.', {
        type: 'property_inspector',
        path: 'game.Workspace.Lobby.Floor',
        className: 'Part',
        groups: [
          {
            name: 'Appearance',
            rows: [
              { name: 'Material', value: 'Concrete', changed: true, previous: 'Plastic' },
              { name: 'BrickColor', value: 'Fossil', changed: true, previous: 'Medium stone grey' },
              { name: 'Reflectance', value: '0' },
            ],
          },
          {
            name: 'Transform',
            rows: [
              { name: 'Size', value: '86, 1, 74' },
              { name: 'Position', value: '0, 0.5, 0' },
              { name: 'Anchored', value: 'true' },
            ],
          },
        ],
      }),
      one('test_report', 'A playtest run, pass/fail bar and per-case messages.', {
        type: 'test_report',
        title: 'Playtest · 6s server simulation',
        passed: 7,
        failed: 1,
        skipped: 1,
        durationMs: 6420,
        cases: [
          { name: 'PortalService loads', status: 'pass', durationMs: 12 },
          { name: 'Touch teleports the player', status: 'pass', durationMs: 88 },
          { name: 'Debounce blocks a second touch', status: 'pass', durationMs: 41 },
          {
            name: 'CheckpointPad awards points',
            status: 'fail',
            durationMs: 30,
            message: 'attempt to index nil with "leaderstats" — CheckpointPad.Touched:14',
          },
          { name: 'Shop UI opens', status: 'skip' },
        ],
      }),
      one('asset_picker', 'Marketplace results, with only https links allowed.', {
        type: 'asset_picker',
        title: 'Candidate portal frames',
        actionLabel: 'Say which one to insert and Apple will place it.',
        assets: [
          {
            id: '1094710',
            name: 'Stone Archway',
            kind: 'model',
            creator: 'Roblox',
            note: '412 parts · 18 studs tall',
            link: { href: 'https://create.roblox.com/store/asset/1094710', label: 'View on Creator Store' },
          },
          { id: '9271455', name: 'Rune Ring', kind: 'mesh', creator: 'Roblox', note: '1 mesh · 6 studs' },
          { id: '1837520', name: 'Portal Hum', kind: 'sound', creator: 'Roblox', note: 'Looping · 4s' },
        ],
      }),
      one('build_plan', 'The plan, with a live step. State only — never reasoning.', {
        type: 'build_plan',
        title: 'Rebuild the lobby',
        steps: [
          { title: 'Read the place', status: 'done', tool: 'get_project_tree', durationMs: 640 },
          { title: 'Checkpoint before changes', status: 'done', tool: 'create_checkpoint', durationMs: 1180 },
          {
            title: 'Place the plinth, pillars and portal',
            status: 'active',
            tool: 'create_instances',
            detail: '24 parts under Workspace.Lobby',
          },
          { title: 'Wire PortalService', status: 'pending', tool: 'edit_script' },
          { title: 'Verify visually', status: 'pending', tool: 'inspect_visually' },
        ],
      }),
      one('error_diagnosis', 'A runtime error with the excerpt and buildable fixes.', {
        type: 'error_diagnosis',
        title: 'Touched handler indexes a missing leaderstats folder',
        severity: 'blocking',
        location: 'ServerScriptService.CheckpointPad:14',
        message: 'attempt to index nil with "leaderstats"',
        cause:
          'The pad reads player.leaderstats before PlayerAdded has created it, so the first player to touch it hits nil.',
        excerpt: [
          { n: 12, text: 'local function onTouched(hit)' },
          { n: 13, text: '\tlocal player = Players:GetPlayerFromCharacter(hit.Parent)' },
          { n: 14, text: '\tlocal points = player.leaderstats.Points', marked: true },
          { n: 15, text: '\tpoints.Value += 5' },
        ],
        fixes: [
          {
            title: 'Wait for the folder',
            detail: 'local stats = player:WaitForChild("leaderstats", 5) and bail out when it never arrives.',
          },
          { title: 'Create leaderstats in PlayerAdded before any pad can fire' },
        ],
      }),
      one('checkpoint_comparison', 'Two snapshots and what moved between them.', {
        type: 'checkpoint_comparison',
        left: { label: 'before lobby rebuild (pre-run)', when: '26 minutes ago', scriptCount: 14, instanceCount: 386, sizeBytes: 284112 },
        right: { label: 'coins working (manual)', when: '3 hours ago', scriptCount: 13, instanceCount: 341, sizeBytes: 251004 },
        changes: [
          { kind: 'added', path: 'Scripts', note: '1 script added' },
          { kind: 'added', path: 'Instances', note: '45 instances added' },
          { kind: 'changed', path: 'Workspace.Lobby.Floor', note: 'Material and BrickColor' },
        ],
      }),
      one('progress', 'A bounded meter, or an indeterminate one.', {
        type: 'progress',
        label: 'Snapshot upload',
        value: 68,
        max: 100,
        unit: '%',
        tone: 'accent',
      }),
      one('usage_summary', 'Credits, from the live quota — never a hard-coded number.', {
        type: 'usage_summary',
        title: "Today's Credits",
        remaining: 41,
        dailyLimit: 60,
        usedToday: 19,
        plan: 'free',
        resetsIn: '5:28',
        series: Array.from({ length: 14 }, (_, i) => ({
          day: `d${i}`,
          value: i % 5 === 0 ? 0 : Math.round(6 + 18 * Math.abs(Math.sin(i * 1.3))),
        })),
      }),
      {
        id: 'rejected-html',
        name: 'REJECTED · raw HTML block',
        note: 'An unknown block type fails the whole document. Nothing partial is applied.',
        invalid: true,
        input: { v: 1, blocks: [{ type: 'html', content: '<img src=x onerror=alert(1)>' }] },
      },
      {
        id: 'rejected-style',
        name: 'REJECTED · injected style/onClick',
        note: 'React and DOM props are not in the allowlist, so they are refused and never copied.',
        invalid: true,
        input: {
          v: 1,
          blocks: [{ type: 'text', text: 'Innocent', style: { position: 'fixed' }, onClick: 'alert(1)' }],
        },
      },
      {
        id: 'rejected-url',
        name: 'REJECTED · javascript: link',
        note: 'Only https:, in-app paths and #fragments pass the URL check.',
        invalid: true,
        input: {
          v: 1,
          blocks: [{ type: 'callout', tone: 'info', text: 'Click me', link: { href: 'javascript:alert(1)', label: 'Go' } }],
        },
      },
      {
        id: 'rejected-colour',
        name: 'REJECTED · arbitrary colour',
        note: 'Tone is a closed enum; #ff0000 is not a token.',
        invalid: true,
        input: { v: 1, blocks: [{ type: 'callout', tone: '#ff0000', text: 'Danger' }] },
      },
    ];
  }, []);
}

/**
 * The notices, driven by hand.
 *
 * Toasts are the one part of this product that cannot be reviewed from a screenshot: what matters
 * is what happens over the next ten seconds — whether a repeat stacks or counts, whether the Undo
 * is still there when you reach for it, whether taking it actually puts the thing back. So the
 * specimen is a set of buttons and a row that really changes, and the undo really reverses it.
 */
function NoticeSpecimen() {
  const { toast } = useToast();
  const [archived, setArchived] = useState(false);

  return (
    <section className="lab-specimen" aria-label="Notices">
      <header className="lab-specimen-head">
        <span className="lab-specimen-name">NOTICES · toast, count, undo</span>
        <span className="lab-specimen-note">
          A repeat counts rather than stacks. An Undo stays for {Math.round(UNDO_WINDOW_MS / 1000)}s and runs once.
        </span>
      </header>
      <div className="lab-specimen-body lab-marks">
        <button type="button" className="btn btn-sm" onClick={() => toast('Display name saved', 'success')}>
          Success
        </button>
        <button type="button" className="btn btn-sm" onClick={() => toast('Preparing export…', 'info')}>
          Info
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => toast('Could not reach Apple. Check your connection first.', 'error')}
        >
          Error
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            for (let i = 0; i < 3; i += 1) toast('Studio disconnected', 'error');
          }}
        >
          The same thing, three times
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={archived}
          onClick={() => {
            setArchived(true);
            const undo = createUndoable({ label: 'Undo', reverse: () => setArchived(false) });
            toast('"Sample project" archived', 'success', {
              action: { label: 'Undo', run: () => void undo.undo() },
            });
          }}
        >
          Archive, with an undo
        </button>
        <code className="lab-state-id">sample project: {archived ? 'archived' : 'active'}</code>
      </div>
    </section>
  );
}

export function UiLabPage() {
  const specimens = useSpecimens();
  const coverage = useMemo(() => {
    const seen = new Set<string>();
    for (const s of specimens) {
      const result = validateDocument(s.input);
      if (result.ok) for (const b of result.doc.blocks) seen.add(b.type);
    }
    return { seen: seen.size, total: BLOCK_TYPES.length };
  }, [specimens]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">UI lab</h1>
          <p className="page-sub">
            Every block the agent is allowed to render, with representative data — plus the documents that are refused.
            Covering {coverage.seen} of {coverage.total} block types.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ the status marks -----
         Side by side because that is the only way to see whether they read as one
         family — and whether success and error are distinguishable by SHAPE and not
         only by colour, which is the property that matters to anyone who cannot tell
         the two colours apart. */}
      <section className="lab-specimen" aria-label="Status marks">
        <header className="lab-specimen-head">
          <span className="lab-specimen-name">STATUS MARKS · I-series</span>
          <span className="lab-specimen-note">
            {Object.keys(STATUS).length} marks. Tone is the status, not a prop.
          </span>
        </header>
        <div className="lab-specimen-body lab-marks">
          {(Object.keys(STATUS) as StatusName[]).map((name) => (
            <div key={name} className="lab-mark">
              <StatusIcon status={name} size={18} />
              <code className="lab-state-id">{STATUS[name].canonical} · {name}</code>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ the canonical states --
         The nine empty/waiting/failed states, rendered together. Apart they are easy
         to get subtly wrong — a failure toned like a success, two titles that say the
         same thing differently — and those mistakes are only visible side by side.
         The tenth, M06, is listed as reserved rather than drawn, because the browser
         cannot observe whether a Studio plugin is installed. */}
      <NoticeSpecimen />

      <section className="lab-specimen" aria-label="Canonical states">
        <header className="lab-specimen-head">
          <span className="lab-specimen-name">CANONICAL STATES · M01–M10</span>
          <span className="lab-specimen-note">
            {Object.keys(EMPTY_STATES).length} rendered, 1 reserved. Tone is a property of the state, not a prop.
          </span>
        </header>
        <div className="lab-specimen-body lab-states">
          {(Object.keys(EMPTY_STATES) as EmptyStateName[]).map((name) => (
            <div key={name} className="lab-state">
              <code className="lab-state-id">
                {EMPTY_STATES[name].canonical} · {name} · {EMPTY_STATES[name].tone}
              </code>
              <EmptyState state={name} />
            </div>
          ))}
          <div className="lab-state">
            <code className="lab-state-id">{M06_NOT_MODELLED.canonical} · reserved</code>
            <p className="lab-specimen-note">{M06_NOT_MODELLED.reason}</p>
          </div>
        </div>
      </section>

      <div className="lab-layout">
        <nav className="lab-nav" aria-label="Specimens">
          {specimens.map((s) => (
            <a key={s.id} href={`#lab-${s.id}`}>
              {s.name}
            </a>
          ))}
        </nav>

        <div>
          {specimens.map((s) => (
            <section
              key={s.id}
              id={`lab-${s.id}`}
              className={`lab-specimen${s.invalid ? ' lab-invalid' : ''}`}
              aria-label={s.name}
            >
              <header className="lab-specimen-head">
                <span className="lab-specimen-name">{s.name}</span>
                <span className="lab-specimen-note">{s.note}</span>
              </header>
              <div className="lab-specimen-body">
                <GenerativeUIPanel input={s.input} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
