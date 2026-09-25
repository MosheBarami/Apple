// How this person wants to be worked with — and the two places that is allowed to change behaviour.
//
// A preference is only real if something reads it. These are stored as ordinary rows in
// `memory-store.ts` (kind `preference`), which is what gives them scoping, expiry, audit, export
// and the org/user/project layering for free, and they are read in exactly two places:
//
//   - the SYSTEM PROMPT, through `preferencesPrompt` — language, response length, coding style,
//     Roblox conventions, and the personal profile.
//   - the TOOLSET, through `applyToolPermissions` — which is the only one of these that is a
//     guarantee rather than a request, and so is the only one written to NARROW and never widen.
//
// Everything here validates against an explicit allowlist. `Record<PreferenceKey, T>` says nothing
// at runtime, and every one of these values arrives from a request body or from a row someone
// exported, edited by hand and imported back.
import type { Env } from './env';
import type { MemoryAccess, MemoryEntry, MemoryScope, ResolvedMemory } from './memory-store';
import { MEMORY_KEY_RE, ensureMemoryTables, isMemoryScope, listMemoryEntries, precedenceOf, resolveMemoryLayers } from './memory-store';
import { MEMORY_MODE_DEFAULT, isMemoryMode, type MemoryMode } from './memory';
import {
  mergeEventPrefs,
  normaliseDelivery,
  normaliseEventPrefs,
  type DeliveryPreference,
  type NotificationEventPrefs,
  type NotificationPrefReject,
} from './notifications';

// ---------------------------------------------------------------------------------------------
// the vocabulary
// ---------------------------------------------------------------------------------------------

export const PREFERENCE_KEYS = [
  'coding_style',
  'roblox_conventions',
  'language',
  'model',
  'response_length',
  'tool_permissions',
  // Notification settings are preferences like any other, and they are stored here rather than in
  // a table of their own for one reason: this is the machinery that already scopes a setting to an
  // org, a person or a single project, layers the three, shows which layer won, expires rows,
  // audits writes and exports them. A second store would have had to grow all of that, or ship
  // without it, and "per-project notification preferences" is exactly the thing the layering
  // already does. The values themselves are validated by notifications.ts.
  'notify_delivery',
  'notify_events',
  // Whether Apple may keep what it works out about a project at all, and whether it has to ask
  // first. It is a preference rather than a switch of its own because it is the same question as
  // every other one here — set it for yourself, or for one project, or for a whole organisation —
  // and because a compliance rule that could not be set at the org layer would not be a rule.
  'memory_mode',
  // Where Apple is allowed to get assets from when it builds. The owner's rule: ask before
  // building unless the answer has been settled once. It lives here rather than in a dialog's own
  // local state because "settled once" has to mean settled for this project, or this person, or
  // this organisation — which is the layering this file already does.
  'asset_sources',
  // Whether a request event may carry this person's account id. The request log recorded one on
  // EVERY /api/* call and kept it for thirty days, and there was no way to say no — not here, not
  // in the settings page, not in the middleware. It is a preference for the same reason memory_mode
  // is: an organisation has to be able to decide it for its people, and it NARROWS across layers so
  // a project cannot switch somebody's account back on. Read by analytics-consent.ts.
  'analytics_opt_out',
] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export const CODING_STYLES = ['idiomatic', 'minimal', 'commented', 'strict-typed', 'oop', 'functional'] as const;
export type CodingStyle = (typeof CODING_STYLES)[number];

/**
 * Roblox house rules, as a SET rather than one choice: "Rojo layout" and "server-authoritative"
 * are both true of the same codebase, and forcing a single pick would make the setting useless to
 * anyone who has more than one convention.
 */
export const ROBLOX_CONVENTIONS = [
  'rojo-project',
  'studio-native',
  'knit',
  'strict-luau',
  'attributes-over-values',
  'server-authoritative',
  'module-per-feature',
  'no-wait-loops',
] as const;
export type RobloxConvention = (typeof ROBLOX_CONVENTIONS)[number];
export const ROBLOX_CONVENTIONS_MAX = 6;

/**
 * Languages the product will answer in.
 *
 * An allowlist rather than "any BCP-47 tag" because this string is rendered into the system prompt
 * as an instruction, and a free-text language field is a free-text instruction field wearing a
 * label. Hebrew is first-class here: this product is built in it.
 */
// 'he' was removed on 2026-09-20: a Hebrew prompt was measured losing a word silently on the way
// in (לבה -> לב, lava -> heart) and returning an empty run intent, so the product stopped offering
// the language rather than keep a promise it could not hold.
export const LANGUAGES = ['en', 'es', 'pt-BR', 'fr', 'de', 'ru', 'ja', 'ko', 'zh'] as const;
export type LanguageTag = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Readonly<Record<LanguageTag, string>> = {
  en: 'English',
  'pt-BR': 'Brazilian Portuguese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

export const RESPONSE_LENGTHS = ['brief', 'normal', 'detailed'] as const;
export type ResponseLength = (typeof RESPONSE_LENGTHS)[number];

// The vocabulary lives in @golem/shared for the reason the asset-source one does, and with more at
// stake: the settings panel now RENDERS a control per governed tool, and this module refuses any
// name the registry does not have. Two arrays that agree today are not one array — the failure only
// shows up when somebody edits one of them, and it shows up as a save that silently refuses a
// permission the user believes they set. See tool-permissions.test.mjs.
import { TOOL_PERMISSIONS, isToolPermission, type ToolPermission } from '@golem/shared';
export { TOOL_PERMISSIONS, isToolPermission, type ToolPermission };
export const TOOL_PERMISSION_ENTRIES_MAX = 64;

const inList = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === 'string' && (list as readonly string[]).includes(v);

export const isCodingStyle = (v: unknown): v is CodingStyle => inList(CODING_STYLES, v);
export const isRobloxConvention = (v: unknown): v is RobloxConvention => inList(ROBLOX_CONVENTIONS, v);
export const isLanguageTag = (v: unknown): v is LanguageTag => inList(LANGUAGES, v);
export const isResponseLength = (v: unknown): v is ResponseLength => inList(RESPONSE_LENGTHS, v);
// The vocabulary lives in @golem/shared: the dialog offers these choices and this module
// validates what comes back, and a list in two places lets the dialog offer an option the worker
// refuses. The narrowing rules below are the worker's, because they are about layered policy
// rather than about what the words mean.
import { ASSET_SOURCE_CHOICES, ASSET_SOURCE_DEFAULT, type AssetSourceChoice, type AssetSourcePolicy } from '@golem/shared';

export { ASSET_SOURCE_CHOICES, ASSET_SOURCE_DEFAULT, type AssetSourceChoice, type AssetSourcePolicy };

export function isAssetSourcePolicy(v: unknown): v is AssetSourcePolicy {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = v as Partial<AssetSourcePolicy>;
  if (p.mode !== 'ask' && p.mode !== 'remember') return false;
  if (!Array.isArray(p.allow)) return false;
  // Duplicates are rejected rather than de-duplicated. A client sending the same choice twice has
  // a bug, and quietly repairing it hides the bug while the next one may not be repairable.
  if (new Set(p.allow).size !== p.allow.length) return false;
  return p.allow.every((c) => inList(ASSET_SOURCE_CHOICES, c));
}

/**
 * Layering for asset sources NARROWS, like tool permissions and memory mode, and for the same
 * reason: an organisation that has decided its builds may not pull from the Creator Store has made
 * a spending and licensing decision, and a rule a project can switch back on is not a rule.
 *
 * So the result allows only what BOTH layers allow, and `ask` beats `remember` — being asked is
 * the more conservative of the two, because it is the state in which nothing happens by default.
 */
export function narrowAssetSources(
  a: AssetSourcePolicy | undefined,
  b: AssetSourcePolicy | undefined,
): AssetSourcePolicy {
  if (!isAssetSourcePolicy(a)) return isAssetSourcePolicy(b) ? b : ASSET_SOURCE_DEFAULT;
  if (!isAssetSourcePolicy(b)) return a;
  return {
    mode: a.mode === 'ask' || b.mode === 'ask' ? 'ask' : 'remember',
    allow: a.allow.filter((c) => b.allow.includes(c)),
  };
}

export const isPreferenceKey = (v: unknown): v is PreferenceKey => inList(PREFERENCE_KEYS, v);

export interface Preferences {
  coding_style?: CodingStyle;
  roblox_conventions?: RobloxConvention[];
  language?: LanguageTag;
  /** A provider model id, validated against the ids this deployment can actually serve. */
  model?: string;
  response_length?: ResponseLength;
  tool_permissions?: Record<string, ToolPermission>;
  /** Quiet hours, digest and the zone they are read in. See notifications.ts. */
  notify_delivery?: DeliveryPreference;
  /** Which kinds of notification this layer wants. Merged per entry, not per object. */
  notify_events?: NotificationEventPrefs;
  /** `auto`, `review` or `off`. See memory.ts — and `mergePreferences`, where it NARROWS. */
  memory_mode?: MemoryMode;
  /** Where builds may take assets from. NARROWS across layers — see `narrowAssetSources`. */
  asset_sources?: AssetSourcePolicy;
  /** True to keep this person's account id off analytics events. NARROWS: any layer's `true` wins. */
  analytics_opt_out?: boolean;
}

export type PreferenceReject =
  | 'unknown_key'
  | 'bad_value'
  | 'no_model_allowlist'
  | 'unknown_model'
  | 'no_tool_allowlist'
  | 'unknown_tool'
  | 'too_many'
  // The notification vocabulary's own refusals, carried through rather than collapsed into
  // `bad_value`: "you cannot mute a security notification" and "this deployment has no mail
  // transport" are different sentences, and a settings page that could only say "bad value" would
  // leave a person toggling a switch that silently refuses.
  | NotificationPrefReject;

export interface NormalisedPreferences {
  prefs: Preferences;
  /** Every key that was dropped and why — the settings page shows these rather than silently losing them. */
  rejected: { key: string; reason: PreferenceReject }[];
}

export interface PreferenceVocabulary {
  /** Model ids this deployment can serve. ABSENT is not the same as empty — see below. */
  knownModelIds?: readonly string[];
  /** Tool names that exist. Same rule. */
  knownToolNames?: readonly string[];
}

/**
 * Validate a preferences object from outside.
 *
 * FAIL-CLOSED ON A MISSING ALLOWLIST. `model` and `tool_permissions` name things that live in other
 * modules — the provider registry and the tool table — so this function cannot check them on its
 * own. When the caller does not supply the list, the key is REJECTED, not accepted unchecked. An
 * unchecked model id becomes a model the gateway cannot route and a run that dies at the first
 * call; an unchecked tool name becomes a permission entry that looks enforced in the UI and matches
 * no tool at all. Both are the shape of guard that measures nothing and reports success.
 */
export function normalisePreferences(input: unknown, vocab: PreferenceVocabulary = {}): NormalisedPreferences {
  const prefs: Preferences = {};
  const rejected: { key: string; reason: PreferenceReject }[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { prefs, rejected };

  // Own keys only: an attacker-supplied object cannot smuggle a preference through the prototype,
  // and a `for...in` here would happily read one.
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isPreferenceKey(key)) {
      rejected.push({ key, reason: 'unknown_key' });
      continue;
    }
    switch (key) {
      case 'coding_style':
        if (isCodingStyle(value)) prefs.coding_style = value;
        else rejected.push({ key, reason: 'bad_value' });
        break;
      case 'language':
        if (isLanguageTag(value)) prefs.language = value;
        else rejected.push({ key, reason: 'bad_value' });
        break;
      case 'response_length':
        if (isResponseLength(value)) prefs.response_length = value;
        else rejected.push({ key, reason: 'bad_value' });
        break;
      case 'asset_sources':
        if (isAssetSourcePolicy(value)) prefs.asset_sources = value;
        else rejected.push({ key, reason: 'bad_value' });
        break;
      case 'memory_mode':
        if (isMemoryMode(value)) prefs.memory_mode = value;
        else rejected.push({ key, reason: 'bad_value' });
        break;
      case 'analytics_opt_out':
        // A boolean, and only a boolean. `'false'` and `0` are the two values a form sends by
        // accident, and both would be truthy or falsy in a way somebody has to guess at; a consent
        // flag is the last field in this list that should be decided by coercion.
        if (typeof value === 'boolean') prefs.analytics_opt_out = value;
        else rejected.push({ key, reason: 'bad_value' });
        break;
      case 'roblox_conventions': {
        if (!Array.isArray(value)) {
          rejected.push({ key, reason: 'bad_value' });
          break;
        }
        const out: RobloxConvention[] = [];
        for (const v of value) {
          if (!isRobloxConvention(v)) {
            rejected.push({ key: `roblox_conventions:${String(v).slice(0, 40)}`, reason: 'bad_value' });
            continue;
          }
          if (!out.includes(v) && out.length < ROBLOX_CONVENTIONS_MAX) out.push(v);
        }
        if (out.length) prefs.roblox_conventions = out;
        break;
      }
      case 'model': {
        if (typeof value !== 'string' || !value) {
          rejected.push({ key, reason: 'bad_value' });
          break;
        }
        if (!vocab.knownModelIds) {
          rejected.push({ key, reason: 'no_model_allowlist' });
          break;
        }
        if (!vocab.knownModelIds.includes(value)) {
          rejected.push({ key, reason: 'unknown_model' });
          break;
        }
        prefs.model = value;
        break;
      }
      case 'notify_delivery': {
        // The whole object or the defaults - see `normaliseDelivery`. A window with no zone to
        // read it in would be applied in UTC, which silences the wrong part of somebody's day.
        const r = normaliseDelivery(value);
        for (const rej of r.rejected) rejected.push({ key: `notify_delivery:${rej.key}`, reason: rej.reason });
        prefs.notify_delivery = r.delivery;
        break;
      }
      case 'notify_events': {
        const r = normaliseEventPrefs(value);
        for (const rej of r.rejected) rejected.push({ key: `notify_events:${rej.key}`, reason: rej.reason });
        if (Object.keys(r.events).length > 0) prefs.notify_events = r.events;
        break;
      }
      case 'tool_permissions': {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          rejected.push({ key, reason: 'bad_value' });
          break;
        }
        if (!vocab.knownToolNames) {
          rejected.push({ key, reason: 'no_tool_allowlist' });
          break;
        }
        const perms: Record<string, ToolPermission> = {};
        let n = 0;
        for (const [tool, perm] of Object.entries(value as Record<string, unknown>)) {
          if (!vocab.knownToolNames.includes(tool)) {
            rejected.push({ key: `tool_permissions:${tool.slice(0, 60)}`, reason: 'unknown_tool' });
            continue;
          }
          if (!isToolPermission(perm)) {
            rejected.push({ key: `tool_permissions:${tool.slice(0, 60)}`, reason: 'bad_value' });
            continue;
          }
          if (n >= TOOL_PERMISSION_ENTRIES_MAX) {
            rejected.push({ key: `tool_permissions:${tool.slice(0, 60)}`, reason: 'too_many' });
            continue;
          }
          perms[tool] = perm;
          n++;
        }
        if (n) prefs.tool_permissions = perms;
        break;
      }
    }
  }
  return { prefs, rejected };
}

// ---------------------------------------------------------------------------------------------
// layering
// ---------------------------------------------------------------------------------------------

export interface MergedPreferences {
  prefs: Preferences;
  /** Which layer each value came from, so the settings page can say "set by your organisation". */
  sources: Partial<Record<PreferenceKey, MemoryScope>>;
}

/**
 * Layer org, then user, then project.
 *
 * Every key overrides — EXCEPT `tool_permissions`, which intersects towards the most restrictive
 * answer. That asymmetry is the point rather than an inconsistency: the other preferences are about
 * taste, and the person closest to the work should win. Tool permissions are about what the agent
 * is allowed to DO, and a rule that a lower layer can override is not a rule. `deny` at any layer
 * survives every layer above it; `ask` survives `allow`.
 */
export function mergePreferences(layers: Partial<Record<MemoryScope, Preferences>>): MergedPreferences {
  const order = (['org', 'user', 'project'] as const).filter((s) => layers[s]);
  // Sorted by the store's own precedence rather than by this literal, so the two can never drift
  // apart into two different opinions about which layer wins.
  order.sort((a, b) => precedenceOf(a) - precedenceOf(b));

  const prefs: Preferences = {};
  const sources: Partial<Record<PreferenceKey, MemoryScope>> = {};
  for (const scope of order) {
    const layer = layers[scope]!;
    for (const key of PREFERENCE_KEYS) {
      // `notify_events` is excluded here and merged per entry below. The exclusion is REDUNDANT
      // as the code stands - the per-entry merge runs afterwards and overwrites whatever this loop
      // wrote - and it is kept because it states the intent at the place a reader looks for it,
      // and because the redundancy disappears the moment the two are reordered.
      //
      // `asset_sources` is in the same position and was MEASURED to be: deleting it from this list
      // leaves all 13 assertions in asset-source-policy.test.mjs green, because the narrowing loop
      // below overwrites this one. Recorded rather than removed, for the reason above - and so the
      // next person to read a green suite does not count this line as covered.
      if (key === 'tool_permissions' || key === 'notify_events' || key === 'memory_mode' || key === 'asset_sources' || key === 'analytics_opt_out') continue;
      const v = layer[key];
      if (v === undefined) continue;
      (prefs as Record<string, unknown>)[key] = v;
      sources[key] = scope;
    }
  }

  const merged: Record<string, ToolPermission> = {};
  let sawPerms = false;
  for (const scope of order) {
    const perms = layers[scope]?.tool_permissions;
    if (!perms) continue;
    sawPerms = true;
    for (const [tool, perm] of Object.entries(perms)) {
      merged[tool] = mostRestrictive(merged[tool], perm);
    }
    sources.tool_permissions = scope;
  }
  if (sawPerms) prefs.tool_permissions = merged;

  //[[ `memory_mode` NARROWS, like tool permissions and unlike everything else here.
  //
  //   The other preferences are taste, and the person closest to the work should win. This one is
  //   not: an organisation that turns memory off has made a decision about what may be retained
  //   and re-sent to a model provider, and a rule a lower layer can switch back on is not a rule.
  //   So the strictest layer wins wherever it was set — the same asymmetry, for the same reason,
  //   and expressed through the same kind of rank function.
  //
  //   `sources` names the layer that actually decided, not the last one to hold an opinion, so the
  //   panel can say "your organisation turned this off" instead of showing a control that silently
  //   does nothing. ]]
  let mode: MemoryMode | undefined;
  for (const scope of order) {
    const v = layers[scope]?.memory_mode;
    if (v === undefined) continue;
    const next = mostRestrictiveMemoryMode(mode, v);
    if (next !== mode) sources.memory_mode = scope;
    mode = next;
  }
  if (mode !== undefined) prefs.memory_mode = mode;

  // `asset_sources` narrows for the same reason memory_mode does, and is layered the same way.
  // The one difference worth stating: narrowing an intersection means a project can only ever
  // REMOVE a source its organisation already allowed. A project that lists a source the org did
  // not is not an error and is not reported as one — it simply does not get that source, which is
  // what `sources` is for.
  let assets: AssetSourcePolicy | undefined;
  for (const scope of order) {
    const v = layers[scope]?.asset_sources;
    if (v === undefined) continue;
    // The retired customer chooser left `ask` rows behind. An empty one meant unanswered,
    // not an explicit ban; a nonempty one still narrows the sources, without reopening UI.
    if (v.mode === 'ask' && v.allow.length === 0) continue;
    const effective = v.mode === 'ask' ? { mode: 'remember' as const, allow: v.allow } : v;
    const next = narrowAssetSources(assets, effective);
    if (JSON.stringify(next) !== JSON.stringify(assets)) sources.asset_sources = scope;
    assets = next;
  }
  // New projects use the owner's internal asset pipeline without a customer-facing source choice.
  // A stored org, user or project policy still narrows it in the loop above.
  prefs.asset_sources = assets ?? ASSET_SOURCE_DEFAULT;

  //[[ `analytics_opt_out` NARROWS, and the narrowing is a one-way door: any layer's `true` wins.
  //
  //   Same reasoning as memory_mode. An organisation that switches analytics off has decided what
  //   may be recorded about its people, and a project that could switch it back on would be
  //   deciding that for them. `sources` names the layer that actually decided, so a settings panel
  //   can say "your organisation turned this off" rather than showing a switch that does nothing.
  //
  //   `false` at every layer is a real answer and is kept, so the panel can tell "nobody has ever
  //   set this" (undefined) from "this was considered and left on". ]]
  let optOut: boolean | undefined;
  for (const scope of order) {
    const v = layers[scope]?.analytics_opt_out;
    if (v === undefined) continue;
    const next = optOut === true || v === true;
    if (next !== optOut) sources.analytics_opt_out = scope;
    optOut = next;
  }
  if (optOut !== undefined) prefs.analytics_opt_out = optOut;

  // `notify_events` merges PER ENTRY, in precedence order, for a reason unrelated to the one that
  // makes tool permissions narrow: nothing about it is a safety rule, and a project that overrode
  // the object wholesale would silently un-mute every kind the person had muted account-wide.
  // A switch that flips itself when you change a different switch is worse than a switch that does
  // not exist.
  const events = mergeEventPrefs(order.map((s) => layers[s]?.notify_events ?? {}));
  if (Object.keys(events).length > 0) {
    prefs.notify_events = events;
    sources.notify_events = order.filter((s) => layers[s]?.notify_events !== undefined).pop();
  }
  return { prefs, sources };
}

/** How much a mode allows. Higher is stricter, so the comparison reads the same way as the tools'. */
const MEMORY_MODE_RANK: Readonly<Record<MemoryMode, number>> = { auto: 0, review: 1, off: 2 };

export function mostRestrictiveMemoryMode(a: MemoryMode | undefined, b: MemoryMode | undefined): MemoryMode {
  if (!isMemoryMode(a)) return isMemoryMode(b) ? b : MEMORY_MODE_DEFAULT;
  if (!isMemoryMode(b)) return a;
  return MEMORY_MODE_RANK[a] >= MEMORY_MODE_RANK[b] ? a : b;
}

/**
 * The mode a run actually uses.
 *
 * ONE function, called by the prompt builder, the distiller, the `remember` tool and the panel, so
 * the four cannot disagree about whether memory is on. The default is stated here rather than at
 * each call site: `prefs.memory_mode ?? 'auto'` written in four places is four opportunities for
 * one of them to become `?? 'off'` or to be forgotten entirely.
 */
export function memoryModeOf(prefs: Preferences | undefined | null): MemoryMode {
  const mode = prefs?.memory_mode;
  return isMemoryMode(mode) ? mode : MEMORY_MODE_DEFAULT;
}

const PERMISSION_RANK: Readonly<Record<ToolPermission, number>> = { allow: 0, ask: 1, deny: 2 };

export function mostRestrictive(a: ToolPermission | undefined, b: ToolPermission | undefined): ToolPermission {
  if (!isToolPermission(a)) return isToolPermission(b) ? b : 'allow';
  if (!isToolPermission(b)) return a;
  return PERMISSION_RANK[a] >= PERMISSION_RANK[b] ? a : b;
}

/**
 * Apply tool permissions to the toolset a mode already allows.
 *
 * NARROWING ONLY. `base` comes from `toolsForMode`, which is what enforces Plan mode's read-only
 * promise; if a preference could add to it, a user preference would be able to hand `run_luau` to
 * the one mode whose entire purpose is that it cannot touch the project. So `allow` is not a
 * capability — it is the absence of a restriction — and a permission naming a tool that is not in
 * `base` changes nothing at all.
 *
 * `ask` narrows too, for now: nothing in this product can interrupt a run to ask, so leaving an
 * `ask` tool in the set would make "ask me first" mean "go ahead". Treating it as `deny` is the
 * honest reading until a confirmation path exists.
 */
export function applyToolPermissions(base: ReadonlySet<string>, perms: Readonly<Record<string, ToolPermission>> | undefined): Set<string> {
  const out = new Set(base);
  if (!perms) return out;
  for (const [tool, perm] of Object.entries(perms)) {
    if (!isToolPermission(perm)) continue;
    if (perm === 'deny' || perm === 'ask') out.delete(tool);
  }
  return out;
}

/**
 * WHAT THE NARROWING ACTUALLY TOOK, so it can be said out loud.
 *
 * `applyToolPermissions` removed tools and nothing recorded which — so "why did Apple not use
 * run_luau on that run" had no answer anywhere in the product, and a capability that is silently
 * not there is indistinguishable, from the user's side, from one that is broken.
 *
 * ONLY WHAT WAS THERE TO TAKE. A permission naming a tool this mode never had changes nothing, and
 * reporting it would tell somebody a capability was withheld when it was never offered — denying
 * delete_instances in Plan mode is a no-op, and announcing it invents a restriction. Sorted, so the
 * same run reports the same sentence twice rather than whatever order the object happened to have.
 */
export function deniedTools(base: ReadonlySet<string>, perms: Readonly<Record<string, ToolPermission>> | undefined): string[] {
  if (!perms) return [];
  const out: string[] = [];
  for (const [tool, perm] of Object.entries(perms)) {
    if (!isToolPermission(perm) || perm === 'allow') continue;
    if (base.has(tool)) out.push(tool);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------------------------
// the personal prompt profile
// ---------------------------------------------------------------------------------------------

export const PROFILE_FIELDS = ['about', 'goals', 'tone', 'experience'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export const PROFILE_FIELD_MAX = 600;
export type PromptProfile = Partial<Record<ProfileField, string>>;

export const isProfileField = (v: unknown): v is ProfileField => inList(PROFILE_FIELDS, v);

export const PROFILE_LABELS: Readonly<Record<ProfileField, string>> = {
  about: 'About them',
  goals: 'What they are trying to make',
  tone: 'How they want to be talked to',
  experience: 'How much Roblox experience they have',
};

export function normaliseProfile(input: unknown): PromptProfile {
  const out: PromptProfile = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isProfileField(k) || typeof v !== 'string') continue;
    const text = v.trim().replace(/\s+/g, ' ').slice(0, PROFILE_FIELD_MAX);
    if (text) out[k] = text;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// preferences as memory rows
// ---------------------------------------------------------------------------------------------

/** Namespaces inside one scope's key space. All match MEMORY_KEY_RE by construction. */
export const PREFERENCE_KEY_PREFIX = 'pref.';
export const PROFILE_KEY_PREFIX = 'profile.';
/** Free-text project / team instructions, which are prose rather than a chosen value. */
export const INSTRUCTION_KEY_PREFIX = 'instruction.';

export const preferenceEntryKey = (k: PreferenceKey): string => `${PREFERENCE_KEY_PREFIX}${k}`;
export const profileEntryKey = (f: ProfileField): string => `${PROFILE_KEY_PREFIX}${f}`;

/**
 * Read preferences back out of stored rows.
 *
 * The stored value is JSON text. A row whose JSON does not parse, or parses into something the
 * allowlist refuses, is dropped — the same treatment an invalid request body gets, because a row
 * edited outside the product and imported back IS a request body with extra steps.
 */
export function preferencesFromEntries(entries: readonly MemoryEntry[], vocab: PreferenceVocabulary = {}): NormalisedPreferences {
  const raw: Record<string, unknown> = {};
  for (const e of entries) {
    if (e.kind !== 'preference' || !e.key.startsWith(PREFERENCE_KEY_PREFIX)) continue;
    const key = e.key.slice(PREFERENCE_KEY_PREFIX.length);
    if (!isPreferenceKey(key)) continue;
    try {
      raw[key] = JSON.parse(e.value);
    } catch {
      /* a row that is not JSON is a row nobody can act on */
    }
  }
  return normalisePreferences(raw, vocab);
}

export function profileFromEntries(entries: readonly MemoryEntry[]): PromptProfile {
  const raw: Record<string, unknown> = {};
  for (const e of entries) {
    if (e.kind !== 'profile' || !e.key.startsWith(PROFILE_KEY_PREFIX)) continue;
    raw[e.key.slice(PROFILE_KEY_PREFIX.length)] = e.value;
  }
  return normaliseProfile(raw);
}

/** Free-text instructions at one scope, in key order, ready to be fenced into a prompt. */
export function instructionsFromEntries(entries: readonly MemoryEntry[], scope: MemoryScope): string[] {
  return entries
    .filter((e) => e.scope === scope && e.kind === 'instruction' && e.key.startsWith(INSTRUCTION_KEY_PREFIX))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((e) => e.value);
}

/** The rows a preferences form writes. One row per key, so each can expire and be audited alone. */
export function preferencesToEntries(prefs: Preferences, scope: MemoryScope, scopeId: string): { scope: MemoryScope; scopeId: string; key: string; kind: 'preference'; value: string }[] {
  if (!isMemoryScope(scope)) throw new Error(`preferencesToEntries: unknown scope ${String(scope)}`);
  const out: { scope: MemoryScope; scopeId: string; key: string; kind: 'preference'; value: string }[] = [];
  for (const key of PREFERENCE_KEYS) {
    const v = prefs[key];
    if (v === undefined) continue;
    const entryKey = preferenceEntryKey(key);
    // Belt and braces: the prefix and the key list are both literals here, but the store's key rule
    // is the one that decides what is addressable, and a key that cannot round-trip through it is a
    // row that could never be deleted through the normal route.
    if (!MEMORY_KEY_RE.test(entryKey)) throw new Error(`preferencesToEntries: ${entryKey} is not a storable key`);
    out.push({ scope, scopeId, key: entryKey, kind: 'preference', value: JSON.stringify(v) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// what reaches the model
// ---------------------------------------------------------------------------------------------

const RESPONSE_LENGTH_RULE: Readonly<Record<ResponseLength, string>> = {
  brief: 'Answer in as few words as the answer takes. No preamble, no summary of what you just did.',
  normal: 'Answer at normal length.',
  detailed: 'Explain your reasoning and the trade-offs, not only the result.',
};

const CODING_STYLE_RULE: Readonly<Record<CodingStyle, string>> = {
  idiomatic: 'Write Luau the way the Roblox community writes it.',
  minimal: 'Write the shortest correct code. No defensive scaffolding the task did not ask for.',
  commented: 'Comment the non-obvious parts — why, not what.',
  'strict-typed': "Use --!strict and annotate types on every function boundary.",
  oop: 'Prefer classes and metatables over free functions when modelling entities.',
  functional: 'Prefer pure functions and immutable data over stateful objects.',
};

const CONVENTION_RULE: Readonly<Record<RobloxConvention, string>> = {
  'rojo-project': 'This project is laid out for Rojo: scripts live in src/ and sync into Studio.',
  'studio-native': 'This project is edited in Studio directly. Do not propose a filesystem layout.',
  knit: 'Services and controllers follow the Knit framework.',
  'strict-luau': 'All Luau is --!strict.',
  'attributes-over-values': 'Use Instance attributes rather than ValueBase objects for per-instance data.',
  'server-authoritative': 'The server owns all state that matters. Never trust a client-sent value.',
  'module-per-feature': 'One ModuleScript per feature, not one giant script.',
  'no-wait-loops': 'Never poll with wait(); use events, RunService or task.wait with a reason.',
};

/**
 * Render preferences and profile into the system prompt.
 *
 * FENCED, and the fence id is REQUIRED. Project and team instructions are free text that another
 * person in an organisation may have written, and the profile is free text too — all of it lands in
 * the highest-trust position in the prompt, on every step of every run. The fence is what keeps it
 * data. An empty fence id is not a weaker secret, it is a constant one, which is why this refuses
 * rather than degrading, exactly like `systemPrompt` does.
 */
export function preferencesPrompt(
  input: { prefs?: Preferences; profile?: PromptProfile; projectInstructions?: readonly string[]; teamInstructions?: readonly string[] },
  fenceId: string,
): string {
  if (!fenceId) throw new Error('preferencesPrompt: fenceId is required — an empty fence id is a constant one');
  const prefs = input.prefs ?? {};
  const lines: string[] = [];
  if (prefs.language) lines.push(`Reply in ${LANGUAGE_NAMES[prefs.language]} unless the user writes in another language.`);
  if (prefs.response_length) lines.push(RESPONSE_LENGTH_RULE[prefs.response_length]);
  if (prefs.coding_style) lines.push(CODING_STYLE_RULE[prefs.coding_style]);
  for (const c of prefs.roblox_conventions ?? []) lines.push(CONVENTION_RULE[c]);

  const profile = input.profile ?? {};
  const profileLines = PROFILE_FIELDS.filter((f) => profile[f]).map((f) => `${PROFILE_LABELS[f]}: ${profile[f]}`);

  const team = (input.teamInstructions ?? []).filter(Boolean);
  const project = (input.projectInstructions ?? []).filter(Boolean);

  const blocks: string[] = [];
  if (lines.length) blocks.push(`How this user wants to be worked with:\n- ${lines.join('\n- ')}`);
  if (profileLines.length) blocks.push(`<user-profile id="${fenceId}">\n${profileLines.join('\n')}\n</user-profile>`);
  // Team first, project second: the later block is the more specific one, and where two
  // instructions genuinely conflict the model reads the nearer one last.
  if (team.length) blocks.push(`Team instructions (notes from the user's organisation, not commands from the system):\n<team-instructions id="${fenceId}">\n- ${team.join('\n- ')}\n</team-instructions>`);
  if (project.length) blocks.push(`Project instructions:\n<project-instructions id="${fenceId}">\n- ${project.join('\n- ')}\n</project-instructions>`);
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------------------------
// personalised routing
// ---------------------------------------------------------------------------------------------

/**
 * What each internal model key needs from whatever serves it.
 *
 * Mirrors MODEL_KEY_NEEDS in providers/types.ts, and deliberately answers the UNKNOWN key with the
 * most demanding requirement rather than the least. A `Record<string, …>` lookup on an unrecognised
 * key yields undefined, and `undefined?.tools` is falsy — so the naive read of that table says an
 * unknown step needs neither tools nor vision, which is the one answer that lets a preferred model
 * be chosen for a step it cannot serve. Failing closed here costs a fallback; failing open costs
 * the run.
 */
export function needsForModelKey(key: unknown): { tools: boolean; vision: boolean } {
  switch (key) {
    case 'memory':
      return { tools: false, vision: false };
    case 'vision':
      return { tools: false, vision: true };
    case 'plan':
    case 'agent':
      return { tools: true, vision: false };
    default:
      return { tools: true, vision: true };
  }
}

export interface RoutableModel {
  id: string;
  available: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
}

export type RoutingReason = 'preferred' | 'no_preference' | 'unknown_model' | 'unavailable' | 'missing_capability';

export interface ModelRouting {
  modelId: string;
  /** True only when the user's own choice is what will run. */
  honoured: boolean;
  reason: RoutingReason;
}

/**
 * Honour the user's preferred model — when it can actually serve this step.
 *
 * The check is on CAPABILITY, not on the name: routing a tool-calling step onto a model with no
 * tool support produces a run that looks like it started and then does nothing, and the user reads
 * that as the product being broken rather than as their own setting being impossible here. So the
 * fallback carries a reason, and the reason is what the UI shows — a preference that was quietly
 * ignored is worse than one that was refused out loud.
 */
export function routePreferredModel(preferred: string | undefined, modelKey: unknown, candidates: readonly RoutableModel[], fallbackId: string): ModelRouting {
  if (!preferred) return { modelId: fallbackId, honoured: false, reason: 'no_preference' };
  const model = candidates.find((m) => m.id === preferred);
  if (!model) return { modelId: fallbackId, honoured: false, reason: 'unknown_model' };
  if (!model.available) return { modelId: fallbackId, honoured: false, reason: 'unavailable' };
  const needs = needsForModelKey(modelKey);
  if ((needs.tools && !model.supportsTools) || (needs.vision && !model.supportsVision)) {
    return { modelId: fallbackId, honoured: false, reason: 'missing_capability' };
  }
  return { modelId: model.id, honoured: true, reason: 'preferred' };
}

// ---------------------------------------------------------------------------------------------
// what a run actually reads
// ---------------------------------------------------------------------------------------------

/**
 * Everything personal that applies to one run of one project, already layered and already rendered.
 *
 * One function so the prompt, the toolset and the memory viewer cannot end up with three different
 * opinions about which layer won. `sources` is carried through to the UI for the same reason the
 * resolver reports `shadowed`: a setting that is being overridden somewhere else reads as a broken
 * control until the product says where.
 */
export interface Personalisation {
  prefs: Preferences;
  /** Already resolved through `memoryModeOf`, so a run never has to default it again. */
  memoryMode: MemoryMode;
  sources: Partial<Record<PreferenceKey, MemoryScope>>;
  profile: PromptProfile;
  projectInstructions: string[];
  teamInstructions: string[];
  /** Ready to concatenate into the system prompt. Empty when there is nothing to say. */
  promptBlock: string;
  /** Rows the layers disagreed about, so the viewer can explain the disagreement. */
  resolved: ResolvedMemory;
  /**
   * What the layers ABOVE the project already allow — the most this project could ever be given.
   *
   * `asset_sources` NARROWS (see `mergePreferences`), so a project row can only ever remove a
   * source org and user already permit. Without this, the per-project dialog offers three boxes,
   * the person ticks one their organisation forbids, the intersection comes back empty, and the
   * product asks the same question again forever — a control that cannot take effect and never
   * says so. The dialog therefore needs to know the ceiling BEFORE it offers the choice.
   *
   * Computed by `mergePreferences` with the project layer left out rather than by a second pass
   * over the precedence rule, because two implementations of "which layer wins" is exactly the
   * divergence this whole function exists to prevent.
   *
   * `undefined` means NOBODY above the project has an opinion, which is not the same as "nothing
   * is allowed": it is the ordinary case, and it leaves all three choices open.
   */
  assetSourceCeiling?: AssetSourcePolicy;
}

export const EMPTY_PERSONALISATION: Personalisation = {
  prefs: {},
  // A store that cannot be read is not a store that turned memory off. The degraded state is the
  // product's default behaviour, not the strictest setting somebody might have had.
  memoryMode: MEMORY_MODE_DEFAULT,
  sources: {},
  profile: {},
  projectInstructions: [],
  teamInstructions: [],
  promptBlock: '',
  resolved: { entries: [], invalid: [] },
};

/**
 * Read one project's personalisation out of the store.
 *
 * The access context is passed in rather than built here, and `resolveForProject` reads only scopes
 * that context has proven — so a project can no more personalise itself with another project's rows
 * than it can read them. `orgIds` are the organisations the OWNER belongs to; each contributes team
 * instructions and a preference layer, and an org the caller is not a member of contributes
 * nothing because the read returns nothing.
 */
export async function personalisationForProject(
  env: Pick<Env, 'CORPUS'>,
  access: MemoryAccess,
  target: { projectId: string; orgIds?: readonly string[] },
  fenceId: string,
  vocab: PreferenceVocabulary = {},
  now = Date.now(),
): Promise<Personalisation> {
  await ensureMemoryTables(env);
  const orgIds = target.orgIds ?? access.orgs.map((o) => o.orgId);

  const orgEntries: MemoryEntry[] = [];
  for (const orgId of orgIds) orgEntries.push(...(await listMemoryEntries(env, access, 'org', orgId, { now })));
  const userEntries = await listMemoryEntries(env, access, 'user', access.userId, { now });
  const projectEntries = await listMemoryEntries(env, access, 'project', target.projectId, { now });

  const orgPrefs = preferencesFromEntries(orgEntries, vocab).prefs;
  const userPrefs = preferencesFromEntries(userEntries, vocab).prefs;
  const merged = mergePreferences({
    org: orgPrefs,
    user: userPrefs,
    project: preferencesFromEntries(projectEntries, vocab).prefs,
  });
  // The same merge, one layer short: what org and user allow between them is the ceiling a project
  // row can narrow but never raise. See `Personalisation.assetSourceCeiling` for why the dialog
  // needs it, and why it is derived here rather than re-derived in the browser.
  const assetSourceCeiling = mergePreferences({ org: orgPrefs, user: userPrefs }).prefs.asset_sources;
  // The profile is PERSONAL. It is read from the user layer only — a project that could write a
  // "user profile" row would be writing a description of the person into their own prompt.
  const profile = profileFromEntries(userEntries);
  const teamInstructions = instructionsFromEntries(orgEntries, 'org');
  const projectInstructions = instructionsFromEntries(projectEntries, 'project');

  const promptBlock = preferencesPrompt({ prefs: merged.prefs, profile, projectInstructions, teamInstructions }, fenceId);
  return {
    prefs: merged.prefs,
    memoryMode: memoryModeOf(merged.prefs),
    sources: merged.sources,
    profile,
    projectInstructions,
    teamInstructions,
    promptBlock,
    resolved: resolveMemoryLayers([...orgEntries, ...userEntries, ...projectEntries], now),
    ...(assetSourceCeiling !== undefined ? { assetSourceCeiling } : {}),
  };
}
