// How you want to be worked with — and where each answer is actually coming from.
//
// The memory panel above this one shows what Apple worked out for itself about this project. This
// one shows the other half: the settings, the personal profile, and the project and team
// instructions that live in the scoped store, layered org → you → this project.
//
// THE ONE THING THIS PANEL MUST NEVER DO IS LIE ABOUT WHICH LAYER IS ANSWERING. A person who sets
// "reply in Hebrew" on their account, watches a project keep answering in English, and is shown no
// reason concludes the setting is broken. So every resolved row names its scope, and a row that is
// overriding something says what it overrode. The layering itself is computed on the SERVER, by the
// same function the agent uses to build its prompt — recomputing precedence here would be a second
// implementation of the rule, and the two would disagree the first time either one changed.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Failure } from '../failure';
import {
  ApiError,
  deleteMemoryEntry,
  downloadMemoryExport,
  fetchMe,
  fetchMemoryAudit,
  fetchPersonalisation,
  fetchScopeMemory,
  importMemory,
  saveMemoryEntry,
  savePreferences,
  savePromptProfile,
  type MemoryScope,
  type Preferences,
  type PromptProfile,
} from '../../lib/api';
import {
  GOVERNED_TOOLS,
  PERMISSION_LABEL,
  TOOL_PERMISSIONS,
  choiceDisabled,
  floorFrom,
  floorNote,
  permissionOf,
  withPermission,
  type ToolPermission,
} from '../../lib/tool-permissions';
import { useToast } from '../toast';

const CODING_STYLES = ['idiomatic', 'minimal', 'commented', 'strict-typed', 'oop', 'functional'] as const;
const RESPONSE_LENGTHS = ['brief', 'normal', 'detailed'] as const;
const LANGUAGES: { tag: string; label: string }[] = [
  { tag: 'en', label: 'English' },
  { tag: 'he', label: 'עברית' },
  { tag: 'es', label: 'Español' },
  { tag: 'pt-BR', label: 'Português (BR)' },
  { tag: 'fr', label: 'Français' },
  { tag: 'de', label: 'Deutsch' },
  { tag: 'ru', label: 'Русский' },
  { tag: 'ja', label: '日本語' },
  { tag: 'ko', label: '한국어' },
  { tag: 'zh', label: '中文' },
];
const CONVENTIONS = [
  { id: 'rojo-project', label: 'Rojo layout' },
  { id: 'studio-native', label: 'Edited in Studio' },
  { id: 'knit', label: 'Knit' },
  { id: 'strict-luau', label: '--!strict everywhere' },
  { id: 'attributes-over-values', label: 'Attributes, not ValueBase' },
  { id: 'server-authoritative', label: 'Server-authoritative' },
  { id: 'module-per-feature', label: 'One module per feature' },
  { id: 'no-wait-loops', label: 'No wait() polling' },
];
const PROFILE_FIELDS: { id: keyof PromptProfile; label: string; placeholder: string }[] = [
  { id: 'about', label: 'About you', placeholder: 'A 14-year-old building obbies with friends.' },
  { id: 'goals', label: 'What you are trying to make', placeholder: 'A tycoon that can hold 30 players.' },
  { id: 'tone', label: 'How you want to be talked to', placeholder: 'Plainly. Skip the encouragement.' },
  { id: 'experience', label: 'Your Roblox experience', placeholder: 'Comfortable in Studio, new to Luau.' },
];

const SCOPE_LABEL: Record<MemoryScope, string> = {
  org: 'your organisation',
  user: 'your account',
  project: 'this project',
};

export function InstructionsPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [scope, setScope] = useState<MemoryScope>('user');

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const userId = me.data?.userId ?? '';
  const scopeId = scope === 'project' ? projectId : userId;

  const resolved = useQuery({
    queryKey: ['personalisation', projectId],
    queryFn: () => fetchPersonalisation(projectId),
    enabled: projectId.length > 0,
  });

  const stored = useQuery({
    queryKey: ['scope-memory', scope, scopeId],
    queryFn: () => fetchScopeMemory(scope, scopeId),
    enabled: scopeId.length > 0,
  });

  const audit = useQuery({
    queryKey: ['memory-audit', scope, scopeId],
    queryFn: () => fetchMemoryAudit(scope, scopeId, 25),
    enabled: scopeId.length > 0,
  });

  // Edits are local until saved, so a refetch on reconnect does not delete what someone is typing.
  const [prefs, setPrefs] = useState<Preferences>({});
  const [profile, setProfile] = useState<PromptProfile>({});
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState('');
  const [addTtl, setAddTtl] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    if (dirty || !stored.data) return;
    setPrefs(stored.data.preferences.prefs);
    setProfile(stored.data.profile);
  }, [stored.data, dirty]);

  // Nothing is adopted across a scope switch: the two scopes hold different values and carrying one
  // into the other would silently copy your account settings onto a project.
  useEffect(() => {
    setDirty(false);
    setAdding('');
    setAddTtl('');
  }, [scope]);

  const instructions = useMemo(
    () => (stored.data?.entries ?? []).filter((e) => e.kind === 'instruction'),
    [stored.data],
  );

  const canWrite = stored.data?.canWrite ?? false;

  const savePrefs = useMutation({
    mutationFn: async () => {
      const out = await savePreferences(scope, scopeId, prefs);
      if (scope === 'user') await savePromptProfile(userId, profile);
      return out;
    },
    onSuccess: (out) => {
      setDirty(false);
      setPrefs(out.preferences);
      if (out.rejected.length) {
        // Named, never swallowed. A setting that was refused and reported as saved is the shape of
        // bug where the user changes the same thing five times and nothing happens.
        toast(`Not saved: ${out.rejected.map((r) => r.key).join(', ')}`, 'error');
      } else {
        toast('Saved — Apple uses this from the next run', 'success');
      }
      void qc.invalidateQueries({ queryKey: ['scope-memory', scope, scopeId] });
      void qc.invalidateQueries({ queryKey: ['personalisation', projectId] });
      void qc.invalidateQueries({ queryKey: ['memory-audit', scope, scopeId] });
    },
    onError: (e: Error) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });

  const addInstruction = useMutation({
    mutationFn: (text: string) => {
      const ttl = Number(addTtl);
      return saveMemoryEntry(scope, scopeId, `instruction.${Date.now().toString(36)}`, {
        value: text,
        kind: 'instruction',
        // Only when it is a real number. An empty box must mean "no expiry", not NaN.
        ...(addTtl.trim() && Number.isFinite(ttl) && ttl > 0 ? { ttlDays: ttl } : {}),
      });
    },
    onSuccess: () => {
      setAdding('');
      setAddTtl('');
      void qc.invalidateQueries({ queryKey: ['scope-memory', scope, scopeId] });
      void qc.invalidateQueries({ queryKey: ['personalisation', projectId] });
      void qc.invalidateQueries({ queryKey: ['memory-audit', scope, scopeId] });
    },
    onError: (e: Error) => toast(e instanceof ApiError ? e.message : 'Could not add that', 'error'),
  });

  const forget = useMutation({
    mutationFn: (key: string) => deleteMemoryEntry(scope, scopeId, key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['scope-memory', scope, scopeId] });
      void qc.invalidateQueries({ queryKey: ['personalisation', projectId] });
      void qc.invalidateQueries({ queryKey: ['memory-audit', scope, scopeId] });
    },
    onError: (e: Error) => toast(e instanceof ApiError ? e.message : 'Could not delete that', 'error'),
  });

  const runImport = useMutation({
    mutationFn: async (file: File) => importMemory(scope, scopeId, JSON.parse(await file.text())),
    onSuccess: (out) => {
      // Both numbers, always. "Imported 3" alone hides the 40 rows that were refused, and an import
      // that silently drops half a file is indistinguishable from one that worked.
      toast(`Imported ${out.imported}. Refused ${out.rejected.length}.`, out.rejected.length ? 'error' : 'success');
      void qc.invalidateQueries({ queryKey: ['scope-memory', scope, scopeId] });
      void qc.invalidateQueries({ queryKey: ['personalisation', projectId] });
    },
    onError: (e: Error) => toast(e instanceof ApiError ? e.message : 'That file could not be imported', 'error'),
  });

  if (me.isPending || stored.isPending) {
    return (
      <p className="gx-empty" aria-busy="true">
        Reading your settings…
      </p>
    );
  }

  if (stored.isError) {
    return (
      <div className="mem">
        <p className="gx-empty" role="alert">
          <Failure error={stored.error} compact />
        </p>
        <button type="button" className="btn" onClick={() => void stored.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const setPref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((p) => {
      const next = { ...p };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
    setDirty(true);
  };

  return (
    <div className="mem prefs">
      <div className="prefs__scopes" role="group" aria-label="Which memory to edit">
        {(['user', 'project'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`prefs__scope${scope === s ? ' prefs__scope--on' : ''}`}
            aria-pressed={scope === s}
            onClick={() => setScope(s)}
          >
            {s === 'user' ? 'Your account' : 'This project'}
          </button>
        ))}
      </div>

      {!canWrite && (
        <p className="mem__note" role="status">
          You can read these but not change them — they are set by {SCOPE_LABEL[scope]}.
        </p>
      )}

      {/* ---------------------------------------------------------------- preferences -- */}
      <label className="field">
        <span className="field-label">Answer me in</span>
        <select
          className="mem__fact"
          value={prefs.language ?? ''}
          disabled={!canWrite}
          onChange={(e) => setPref('language', e.target.value || undefined)}
        >
          <option value="">No preference</option>
          {LANGUAGES.map((l) => (
            <option key={l.tag} value={l.tag}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">How much to say</span>
        <select
          className="mem__fact"
          value={prefs.response_length ?? ''}
          disabled={!canWrite}
          onChange={(e) => setPref('response_length', (e.target.value || undefined) as Preferences['response_length'])}
        >
          <option value="">No preference</option>
          {RESPONSE_LENGTHS.map((r) => (
            <option key={r} value={r}>
              {r === 'brief' ? 'As little as possible' : r === 'normal' ? 'Normal' : 'Explain the reasoning'}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">How to write code</span>
        <select
          className="mem__fact"
          value={prefs.coding_style ?? ''}
          disabled={!canWrite}
          onChange={(e) => setPref('coding_style', (e.target.value || undefined) as Preferences['coding_style'])}
        >
          <option value="">No preference</option>
          {CODING_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="prefs__set" disabled={!canWrite}>
        <legend className="field-label">Roblox conventions</legend>
        {CONVENTIONS.map((c) => {
          const on = (prefs.roblox_conventions ?? []).includes(c.id);
          return (
            <label key={c.id} className="prefs__check">
              <input
                type="checkbox"
                checked={on}
                onChange={() => {
                  const cur = prefs.roblox_conventions ?? [];
                  setPref('roblox_conventions', on ? cur.filter((x) => x !== c.id) : [...cur, c.id]);
                }}
              />
              <span>{c.label}</span>
            </label>
          );
        })}
      </fieldset>

      {/* --------------------------------------------------- what Apple may DO -- */}
      {/*
        The one group of settings on this panel that is not about taste.
        Everything above changes how Apple answers; this changes what it is permitted to touch —
        so it layers the other way round, strictest-wins, and the server intersects rather than
        overrides. That asymmetry is visible here rather than explained: when a stricter rule is
        already in force from another layer, the looser options are GONE from the menu and the
        reason is written beside it. A dropdown still offering "Allowed" under an account-level
        deny would be a control wired to nothing, which is the defect this codebase keeps finding.
      */}
      <fieldset className="prefs__set prefs__tools" disabled={!canWrite}>
        <legend className="field-label">What Apple may do in this project</legend>
        <p className="mem__note">
          Everything not listed here — reading your scripts, searching the docs, looking at the
          viewport — Apple does anyway. These are the ones that change your work.
        </p>
        {GOVERNED_TOOLS.map((g) => {
          const mine = permissionOf(prefs.tool_permissions, g.name);
          // The merged answer for this project, straight from the server. It already contains
          // this layer's own contribution, which is why `floorFrom` compares the two rather than
          // reading the merged value alone — see tool-permissions.ts.
          const effective = permissionOf(resolved.data?.preferences.tool_permissions, g.name);
          const floor = floorFrom(mine, effective);
          return (
            <div key={g.name} className="prefs__tool">
              <label className="field">
                <span className="field-label field-label--sub">{g.label}</span>
                <select
                  className="mem__fact"
                  value={mine}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setPref('tool_permissions', withPermission(prefs.tool_permissions, g.name, e.target.value as ToolPermission))
                  }
                >
                  {TOOL_PERMISSIONS.filter((p) => !choiceDisabled(p, floor)).map((p) => (
                    <option key={p} value={p}>
                      {PERMISSION_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              {mine !== 'allow' && <span className="prefs__value">{g.stops}</span>}
              {floor && (
                <span className="prefs__over" role="status">
                  {floorNote(floor, resolved.data?.sources.tool_permissions)}
                </span>
              )}
            </div>
          );
        })}
      </fieldset>

      {/* ------------------------------------------------------------------- profile -- */}
      {scope === 'user' && (
        <div className="prefs__profile">
          <span className="field-label">About you</span>
          <p className="mem__note">
            Written into every project you build, not just this one. Leave it blank and nothing is sent.
          </p>
          {PROFILE_FIELDS.map((f) => (
            <label key={String(f.id)} className="field">
              <span className="field-label field-label--sub">{f.label}</span>
              <textarea
                className="mem__summary"
                rows={2}
                maxLength={600}
                placeholder={f.placeholder}
                value={profile[f.id] ?? ''}
                disabled={!canWrite}
                onChange={(e) => {
                  setProfile((p) => ({ ...p, [f.id]: e.target.value }));
                  setDirty(true);
                }}
              />
            </label>
          ))}
        </div>
      )}

      <div className="mem__foot">
        <button type="button" className="btn btn-primary" disabled={!dirty || !canWrite || savePrefs.isPending} onClick={() => savePrefs.mutate()}>
          {savePrefs.isPending ? 'Saving…' : 'Save'}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDirty(false);
              setPrefs(stored.data.preferences.prefs);
              setProfile(stored.data.profile);
            }}
          >
            Discard changes
          </button>
        )}
      </div>

      {/* -------------------------------------------------------------- instructions -- */}
      <div className="mem__facts">
        <span className="field-label">
          {scope === 'project' ? 'Instructions for this project' : 'Instructions for everything you build'}
        </span>
        {instructions.length === 0 && <p className="mem__none">None yet.</p>}
        <ul className="mem__list">
          {instructions.map((e) => (
            <li key={e.key} className="mem__item">
              <span className="mem__fact prefs__instruction">{e.value}</span>
              {e.expiresAt && (
                <span className="prefs__until" title={`Forgotten on ${new Date(e.expiresAt).toLocaleString()}`}>
                  until {new Date(e.expiresAt).toLocaleDateString()}
                </span>
              )}
              <button
                type="button"
                className="mem__drop"
                aria-label={`Forget: ${e.value}`}
                disabled={!canWrite || forget.isPending}
                onClick={() => forget.mutate(e.key)}
              >
                Forget
              </button>
            </li>
          ))}
        </ul>

        <form
          className="mem__add"
          onSubmit={(ev) => {
            ev.preventDefault();
            const text = adding.trim();
            if (text) addInstruction.mutate(text);
          }}
        >
          <input
            className="mem__fact"
            value={adding}
            maxLength={4000}
            placeholder="Tell Apple how you want it to work…"
            aria-label="New instruction"
            disabled={!canWrite}
            onChange={(e) => setAdding(e.target.value)}
          />
          <input
            className="prefs__ttl"
            value={addTtl}
            inputMode="numeric"
            placeholder="days"
            aria-label="Forget this after how many days (leave blank to keep it)"
            disabled={!canWrite}
            onChange={(e) => setAddTtl(e.target.value)}
          />
          <button type="submit" className="mem__addbtn" disabled={!canWrite || !adding.trim() || addInstruction.isPending}>
            Add
          </button>
        </form>
      </div>

      {/* ------------------------------------------------------ what the run will use -- */}
      {resolved.data && (
        <div className="prefs__resolved">
          <span className="field-label">What this project&apos;s next run will use</span>
          {resolved.data.resolved.length === 0 ? (
            <p className="mem__none">Nothing yet — Apple is running with its defaults.</p>
          ) : (
            <ul className="mem__list">
              {resolved.data.resolved.map((r) => (
                <li key={r.key} className="prefs__row">
                  <code className="prefs__key">{r.key}</code>
                  <span className="prefs__value">{r.value}</span>
                  <span className="prefs__from">from {SCOPE_LABEL[r.scope]}</span>
                  {r.shadowedBy.length > 0 && (
                    // The line that stops a working control reading as a broken one.
                    <span className="prefs__over">
                      overriding {r.shadowedBy.map((s) => SCOPE_LABEL[s.scope]).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ take it with you -- */}
      <div className="mem__foot">
        <button type="button" className="btn" onClick={() => void downloadMemoryExport(scope, scopeId)}>
          Export
        </button>
        <label className="btn prefs__import">
          Import
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={!canWrite}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // The input is cleared so importing the same file twice actually fires twice.
              e.target.value = '';
              if (file) runImport.mutate(file);
            }}
          />
        </label>
        <button type="button" className="btn" aria-expanded={showAudit} onClick={() => setShowAudit((v) => !v)}>
          {showAudit ? 'Hide history' : 'History'}
        </button>
      </div>

      {showAudit && (
        <div className="prefs__audit">
          {audit.isPending && <p className="mem__none">Reading…</p>}
          {audit.data?.audit.length === 0 && <p className="mem__none">Nothing has changed yet.</p>}
          <ul className="mem__list">
            {(audit.data?.audit ?? []).map((a) => (
              <li key={a.id} className="prefs__row">
                <span className="prefs__from">{new Date(a.at).toLocaleString()}</span>
                <code className="prefs__key">{a.key}</code>
                <span className="prefs__value">
                  {a.action === 'delete' ? `forgotten (was “${a.before ?? ''}”)` : a.before ? `“${a.before}” → “${a.after ?? ''}”` : `set to “${a.after ?? ''}”`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mem__note mem__note--quiet">
            Deleting removes the setting itself. What stays is this line — that it was deleted, when, and
            what it used to say — so a change that stopped applying can still be explained.
          </p>
        </div>
      )}

      <p className="mem__note">
        A project setting overrides your account setting, and your account setting overrides your
        organisation&apos;s — except for what Apple is allowed to DO, where the strictest rule wins
        wherever it was set. Changes apply from the next run; they do not alter anything already built.
      </p>
    </div>
  );
}
