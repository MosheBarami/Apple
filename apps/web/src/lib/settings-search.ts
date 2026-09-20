/**
 * Finding one setting on a page that now has twenty of them.
 *
 * The settings page was four sections long and searching it would have been silly. It is not four
 * sections long any more, and the moment a page needs scrolling, "where is the thing that controls
 * X" becomes the only question anyone asks of it — usually phrased in a word the label does not
 * contain. Someone looking for the clock types "24 hour"; someone looking for appearance types
 * "dark".
 *
 * RANKED BY THE PALETTE'S OWN SCORER, not by a second one written here. `lib/command-match.ts`
 * already encodes what this repo believes about matching — that what people type is almost always a
 * prefix, that keyword matches rank below visible ones, that initials are worth supporting — and
 * two scorers in one product means two behaviours for the same gesture. The palette finds the
 * SETTINGS PAGE; this finds a control on it, and they should feel like the same thing.
 *
 * THE REGISTRY IS THE PAGE'S CONTRACT. Every entry here must correspond to a control that is
 * actually rendered, and tests/settings-search.test.mjs checks both directions against the JSX.
 * A registry entry with no control is a search that finds a result which scrolls to nothing; a
 * control with no entry is a setting that search cannot find, which is the defect this exists to
 * fix, quietly reintroduced one section at a time.
 */
import { scoreCommand, type Command } from './command-match.ts';

export interface SettingField {
  /** Matches the `data-setting` attribute on the rendered control. */
  id: string;
  title: string;
  /** The heading it lives under. Also searchable — "security" should find everything in Security. */
  section: string;
  /** What people call it when they do not call it by its label. */
  keywords?: string[];
}

export const SETTING_FIELDS: readonly SettingField[] = [
  { id: 'display-name', title: 'Display name', section: 'Profile', keywords: ['name', 'nickname', 'call me', 'profile'] },
  { id: 'email-address', title: 'Email address', section: 'Security', keywords: ['mail', 'address', 'change email', 'verified', 'confirm'] },
  { id: 'password', title: 'Password', section: 'Security', keywords: ['change password', 'passphrase', 'credentials', 'reset'] },
  {
    id: 'two-step',
    title: 'Two-step verification',
    section: 'Security',
    keywords: ['two factor', '2fa', 'mfa', 'authenticator', 'totp', 'code', 'google authenticator', 'one time password'],
  },
  { id: 'sign-out-everywhere', title: 'Sign out everywhere', section: 'Security', keywords: ['sessions', 'devices', 'revoke', 'logout all', 'stolen', 'lost laptop'] },
  {
    id: 'security-history',
    title: 'Account history',
    section: 'Security',
    // The words someone types when they are worried, which are not the words in the title. Somebody
    // who has just seen a key they do not recognise searches "audit" or "alerts", never "history".
    keywords: ['security history', 'audit', 'log', 'recent activity', 'activity', 'alerts', 'events', 'notifications', 'who signed in', 'suspicious'],
  },
  { id: 'appearance', title: 'Appearance', section: 'Appearance', keywords: ['theme', 'dark', 'light', 'night', 'colour', 'color', 'system'] },
  { id: 'motion', title: 'Motion', section: 'Appearance', keywords: ['animation', 'reduce', 'accessibility', 'vestibular', 'movement'] },
  { id: 'region', title: 'Regional formatting', section: 'Language and region', keywords: ['locale', 'date format', 'number format', 'decimal', 'separator', 'language'] },
  { id: 'clock', title: 'Clock', section: 'Language and region', keywords: ['24 hour', '12 hour', 'am pm', 'time format'] },
  { id: 'time-zone', title: 'Time zone', section: 'Language and region', keywords: ['timezone', 'utc', 'gmt', 'clock', 'offset'] },
  // `sendKey` is a stored preference too, and it is deliberately NOT listed here: its control lives
  // in the keyboard-shortcuts dialog, beside the binding it changes. A search on this page that
  // returned it would reveal a row this page does not have — the exact failure the registry exists
  // to prevent. tests/settings-search.test.mjs checks that it is reachable there instead.
  {
    id: 'roblox-key',
    title: 'Your Roblox account',
    section: 'Connections',
    keywords: ['roblox', 'open cloud', 'api key', 'connect', 'upload', 'creator', 'credential', 'account'],
  },
  {
    id: 'asset-sources',
    title: 'Where Apple gets assets',
    section: 'Building',
    // Nobody types "asset source policy". They type the thing they are worried about — that it is
    // using other people's work, or that it is spending credits making its own.
    keywords: ['assets', 'library', 'creator store', 'from scratch', 'licence', 'credits', 'where', 'models', 'textures', 'sources', 'pop up', 'ask me'],
  },
  {
    id: 'api-keys',
    title: 'API keys',
    section: 'Connections',
    // The words somebody types in the ten minutes after a key leaks, which are not the words in
    // the title: "revoke", "leaked", "token". Whoever is searching this is usually in a hurry.
    keywords: ['api', 'key', 'token', 'sdk', 'revoke', 'rotate', 'leaked', 'secret', 'developer', 'integration', 'curl'],
  },
  {
    id: 'discord',
    title: 'Discord',
    section: 'Connections',
    // Nobody searching for this types "Discord" — they type the thing they want to do from it.
    keywords: ['discord', 'bot', 'chat', 'slash command', 'link', 'unlink', 'pair', 'build from chat', 'connect'],
  },
  // Notifications. Three rows rather than one, because "stop waking me at night", "send it all at
  // once in the morning" and "stop telling me about builds" are three different requests and a
  // person types the one they have.
  {
    id: 'notify-quiet-hours',
    title: 'Quiet hours',
    section: 'Notifications',
    keywords: ['do not disturb', 'dnd', 'night', 'sleep', 'mute', 'silence', 'interrupt', 'notification'],
  },
  {
    id: 'notify-digest',
    title: 'How often',
    section: 'Notifications',
    keywords: ['digest', 'daily', 'hourly', 'summary', 'batch', 'frequency', 'notification'],
  },
  {
    id: 'notify-events',
    title: 'What to tell me about',
    section: 'Notifications',
    keywords: ['notification', 'alerts', 'mentions', 'build failed', 'email me', 'unsubscribe', 'turn off'],
  },
  // Was 'training-opt-in', a control. Apple does not train on customer work, so there is nothing to
  // opt into — but somebody searching "training" deserves to find the statement that says so.
  { id: 'training-promise', title: 'Apple never trains on your work', section: 'Privacy', keywords: ['training', 'privacy', 'data', 'opt in', 'opt out', 'model'] },
  {
    id: 'analytics-opt-out',
    title: 'Analytics',
    section: 'Privacy',
    // Nobody types "actor attribution in the request log". They type the thing they are uneasy
    // about, and half the time they type the word from somebody else's product.
    keywords: ['analytics', 'tracking', 'telemetry', 'usage data', 'logs', 'request log', 'anonymous', 'do not track'],
  },
  {
    id: 'download-my-data',
    title: 'Download my data',
    section: 'Privacy',
    // The words somebody types when they are leaving, or when a lawyer asked them to.
    keywords: ['export', 'download', 'my data', 'gdpr', 'subject access', 'takeout', 'copy', 'backup', 'everything you have'],
  },
  { id: 'reset-settings', title: 'Reset settings', section: 'Privacy', keywords: ['default', 'defaults', 'restore', 'undo', 'clear'] },
  {
    id: 'delete-account',
    title: 'Delete my account',
    section: 'Danger zone',
    // "Close my account" and "cancel" are what people actually type, and somebody typing "cancel"
    // usually wants the subscription — which is why `close my account` and `cancel account` are
    // here and a bare `cancel` is not.
    keywords: ['delete account', 'close my account', 'cancel account', 'erase', 'remove me', 'right to be forgotten', 'gdpr', 'leave'],
  },
];

const NOOP = () => {};

/**
 * The section is searchable too, and it is matched as its own row rather than folded into the
 * field's title. "security" should reveal all three security controls, and a scorer given
 * "Email address Security" as one string would rank that badly — a title is a title.
 */
function asCommands(field: SettingField): Command[] {
  return [
    { id: field.id, title: field.title, section: field.section, keywords: field.keywords, run: NOOP },
    { id: `${field.id}:section`, title: field.section, section: field.section, keywords: [], run: NOOP },
  ];
}

/**
 * The ids that match, best first.
 *
 * An EMPTY query returns every id in registration order, which is what makes the page behave
 * normally until someone types. Returning nothing for an empty query — the obvious reading of "no
 * search, no results" — would open the settings page blank.
 */
export function matchSettings(query: unknown, fields: readonly SettingField[] = SETTING_FIELDS): string[] {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return fields.map((f) => f.id);

  const best = new Map<string, number>();
  for (const field of fields) {
    for (const command of asCommands(field)) {
      const hit = scoreCommand(command, q);
      if (!hit) continue;
      // A field matched by BOTH its own title and its section keeps the better of the two, so
      // "security" does not rank the section row above the control it names.
      const previous = best.get(field.id);
      if (previous === undefined || hit.score > previous) best.set(field.id, hit.score);
    }
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Is this control visible under the current query? What each row's `hidden` is bound to. */
export function settingMatches(id: string, query: unknown): boolean {
  return matchSettings(query).includes(id);
}

/** Which headings still have at least one visible control — an empty section should not render. */
export function visibleSections(query: unknown, fields: readonly SettingField[] = SETTING_FIELDS): string[] {
  const ids = new Set(matchSettings(query, fields));
  const out: string[] = [];
  for (const f of fields) {
    if (ids.has(f.id) && !out.includes(f.section)) out.push(f.section);
  }
  return out;
}
