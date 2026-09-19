/** First-party presentation profiles. These are design choices, not measured engine verdicts. */
export interface AppleUITheme {
  id: string;
  label: string;
  layout: 'cards' | 'rows';
  panel: string;
  card: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  edge: string;
  danger: string;
  titleFont: 'GothamBold' | 'GothamBlack' | 'GothamMedium';
  radius: number;
  stroke: number;
  titleSize: number;
  hudSide: 'left' | 'right';
  currencyLabel: string;
  shopLabel: string;
  cardHeight: number;
  iconStyle: 'coin' | 'gem' | 'shield' | 'bolt' | 'crate';
}

// Game presentation is deliberately separate from Apple's black conversation UI.
// No external images, unverified asset IDs or paid fonts are embedded in the installed module.
export const APPLE_UI_THEMES: readonly AppleUITheme[] = [
  { id: 'studio', label: 'Neutral', layout: 'rows', panel: '#141a20', card: '#202933', ink: '#f5f7fa', muted: '#bac5d0', accent: '#b3e997', accentInk: '#152311', edge: '#3d4b5a', danger: '#ffb2a5', titleFont: 'GothamBold', radius: 16, stroke: 1, titleSize: 28, hudSide: 'right', currencyLabel: 'BALANCE', shopLabel: 'Upgrades', cardHeight: 144, iconStyle: 'crate' },
  { id: 'simulator', label: 'Simulator', layout: 'cards', panel: '#1269b7', card: '#e9f6ff', ink: '#123452', muted: '#405c73', accent: '#8be34b', accentInk: '#183516', edge: '#123452', danger: '#a12836', titleFont: 'GothamBlack', radius: 20, stroke: 3, titleSize: 32, hudSide: 'left', currencyLabel: 'COINS', shopLabel: 'Upgrade shop', cardHeight: 240, iconStyle: 'gem' },
  { id: 'tycoon', label: 'Tycoon', layout: 'cards', panel: '#17283a', card: '#243e52', ink: '#f4f8f9', muted: '#b9ceda', accent: '#72de8f', accentInk: '#153521', edge: '#456b80', danger: '#ffb0a3', titleFont: 'GothamBold', radius: 12, stroke: 2, titleSize: 29, hudSide: 'left', currencyLabel: 'CASH', shopLabel: 'Build your business', cardHeight: 236, iconStyle: 'crate' },
  { id: 'obby', label: 'Obby', layout: 'cards', panel: '#5146a8', card: '#f4f2ff', ink: '#30265c', muted: '#625782', accent: '#ffe36a', accentInk: '#43350d', edge: '#30265c', danger: '#ad2445', titleFont: 'GothamBlack', radius: 20, stroke: 3, titleSize: 31, hudSide: 'right', currencyLabel: 'PROGRESS', shopLabel: 'Trail shop', cardHeight: 236, iconStyle: 'bolt' },
  { id: 'horror', label: 'Horror', layout: 'rows', panel: '#101416', card: '#1b2225', ink: '#e5e1d4', muted: '#b5b4aa', accent: '#d0bb82', accentInk: '#282316', edge: '#46504e', danger: '#e79b91', titleFont: 'GothamMedium', radius: 4, stroke: 1, titleSize: 26, hudSide: 'right', currencyLabel: 'SUPPLIES', shopLabel: 'Field supplies', cardHeight: 144, iconStyle: 'crate' },
  { id: 'racing', label: 'Racing', layout: 'cards', panel: '#121c2a', card: '#223349', ink: '#f3f7fb', muted: '#b9cada', accent: '#ffba52', accentInk: '#38230d', edge: '#416482', danger: '#ffb2a9', titleFont: 'GothamBlack', radius: 9, stroke: 2, titleSize: 31, hudSide: 'right', currencyLabel: 'RACE CREDITS', shopLabel: 'Garage', cardHeight: 232, iconStyle: 'bolt' },
  { id: 'roleplay', label: 'Roleplay', layout: 'cards', panel: '#f3ece2', card: '#ffffff', ink: '#303d44', muted: '#586974', accent: '#8ed8cd', accentInk: '#183d37', edge: '#c3d0ce', danger: '#a83245', titleFont: 'GothamBold', radius: 18, stroke: 1, titleSize: 29, hudSide: 'right', currencyLabel: 'WALLET', shopLabel: 'City essentials', cardHeight: 232, iconStyle: 'coin' },
  { id: 'tower_defense', label: 'Tower defense', layout: 'cards', panel: '#17283d', card: '#29445e', ink: '#f4f7fb', muted: '#becfdf', accent: '#7fc9fa', accentInk: '#153148', edge: '#527ca1', danger: '#ffaea3', titleFont: 'GothamBlack', radius: 12, stroke: 2, titleSize: 29, hudSide: 'left', currencyLabel: 'CASH', shopLabel: 'Defence roster', cardHeight: 240, iconStyle: 'shield' },
  { id: 'fps_arena', label: 'FPS arena', layout: 'rows', panel: '#141e27', card: '#24343f', ink: '#f0f5f5', muted: '#bacbd0', accent: '#aad887', accentInk: '#203419', edge: '#55707a', danger: '#ffaea1', titleFont: 'GothamBold', radius: 5, stroke: 1, titleSize: 28, hudSide: 'right', currencyLabel: 'MATCH CREDITS', shopLabel: 'Loadout', cardHeight: 144, iconStyle: 'shield' },
  { id: 'anime_battle', label: 'Anime battle', layout: 'cards', panel: '#281745', card: '#412762', ink: '#faf4ff', muted: '#d0bce7', accent: '#bdefff', accentInk: '#253953', edge: '#976abb', danger: '#ffb3c4', titleFont: 'GothamBlack', radius: 12, stroke: 2, titleSize: 31, hudSide: 'right', currencyLabel: 'ENERGY', shopLabel: 'Power collection', cardHeight: 240, iconStyle: 'bolt' },
  { id: 'survival', label: 'Survival', layout: 'cards', panel: '#24352f', card: '#354b3f', ink: '#f1eee3', muted: '#c5cebd', accent: '#e3c587', accentInk: '#3d321b', edge: '#6e8670', danger: '#efaaa0', titleFont: 'GothamBold', radius: 9, stroke: 2, titleSize: 28, hudSide: 'left', currencyLabel: 'RESOURCES', shopLabel: 'Camp supplies', cardHeight: 236, iconStyle: 'crate' },
] as const;

export const APPLE_UI_THEME_IDS = APPLE_UI_THEMES.map(({ id }) => id);

/** Emit literals only: none of the model's or customer's text is executable theme source. */
export function appleUIThemeSource(): string {
  const quote = (value: string) => JSON.stringify(value);
  const colour = (hex: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Invalid UI profile colour');
    const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
    return `Color3.fromRGB(${rgb.join(', ')})`;
  };
  return 'local THEMES = {\n' + APPLE_UI_THEMES.map((theme) => {
    const brightPanel = theme.id === 'simulator' || theme.id === 'obby';
    const properties = Object.entries({ ...theme,
      cardHeight: theme.layout === 'cards' ? Math.max(theme.cardHeight, 272) : Math.max(theme.cardHeight, 184),
      panelInk: brightPanel ? '#ffffff' : theme.ink,
      panelMuted: brightPanel ? '#e3edff' : theme.muted,
    }).map(([key, value]) => {
      const literal = typeof value === 'number' ? String(value)
        : key === 'titleFont' ? `Enum.Font.${value}`
        : String(value).startsWith('#') ? colour(String(value))
        : quote(String(value));
      return `${key} = ${literal}`;
    });
    return `    [${quote(theme.id)}] = { ${properties.join(', ')} },`;
  }).join('\n') + '\n}\n';
}
