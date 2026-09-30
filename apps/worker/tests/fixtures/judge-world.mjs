// Small worlds for the client judge's tests: a finished garden game a client would accept, and the same game as the owner saw
// it fail (a pet system's screen over the HUD, a Spanish developer sign, "loading name...", "$299,999", a dead button, nothing to
// earn, a floating model). Built on the stand-in Studio in fake-studio.mjs; every value is in the plugin's wire form ({t, v}).
import { fakeStudio } from './fake-studio.mjs';

export const str = (v) => ({ t: 'string', v });
export const bool = (v) => ({ t: 'bool', v });
export const num = (v) => ({ t: 'number', v });
export const udim2 = (sx, ox, sy, oy) => ({ t: 'UDim2', v: [sx, ox, sy, oy] });
export const udim = (s, o) => ({ t: 'UDim', v: [s, o] });
export const vec2 = (x, y) => ({ t: 'Vector2', v: [x, y] });
export const color = (r, g, b) => ({ t: 'Color3', v: [r, g, b] });
export const enumItem = (v) => ({ t: 'EnumItem', v });

/** The look of a well-made screen: Gotham, rounded, outlined, bright. Pass another `look` for a screen from another game. */
export const LOOK = {
  garden: { font: 'Enum.Font.GothamBold', corner: 12, stroke: true, bg: [0.25, 0.65, 0.3] },
  pets: { font: 'Enum.Font.SourceSans', corner: 0, stroke: false, bg: [0.08, 0.08, 0.1] },
};

/** A ScreenGui at `path` with its attributes; returns helpers to add elements under it. */
export function screen(f, name, { enabled = true, tag, look = LOOK.garden } = {}) {
  const path = 'game.StarterGui.' + name;
  f.world.add(path, { class: 'ScreenGui', props: { Enabled: bool(enabled), ResetOnSpawn: bool(false) }, attrs: tag ? { AppleLibraryGame: tag, AppleLibraryPath: '/StarterGui/' + name } : {} });
  const put = (parent, n, cls, o = {}) => {
    const p = `${parent}.${n}`;
    const props = {
      Visible: bool(o.visible ?? true),
      Position: udim2(...(o.pos ?? [0, 0, 0, 0])), Size: udim2(...(o.size ?? [0.1, 0, 0.05, 0])), AnchorPoint: vec2(...(o.anchor ?? [0, 0])),
      BackgroundTransparency: num(o.bgT ?? 0), BackgroundColor3: color(...(o.bg ?? look.bg)),
    };
    if (cls === 'TextLabel' || cls === 'TextButton') { props.Text = str(o.text ?? ''); props.Font = enumItem(o.font ?? look.font); }
    f.world.add(p, { class: cls, props });
    if (['Frame', 'TextButton', 'ImageButton', 'TextLabel'].includes(cls)) {
      if (look.corner) f.world.add(p + '.Corner', { class: 'UICorner', props: { CornerRadius: udim(0, look.corner) } });
      if (look.stroke) f.world.add(p + '.Stroke', { class: 'UIStroke', props: { Thickness: num(3), Enabled: bool(true) } });
    }
    return p;
  };
  return { path, put, frame: (n, o) => put(path, n, 'Frame', o), label: (n, o) => put(path, n, 'TextLabel', o), button: (n, o) => put(path, n, 'TextButton', o) };
}

/** A finished garden game: HUD with cash and one left menu, a hidden shop, a spawn on the ground, coins to walk onto. */
export function goodGarden(over = {}) {
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], ...over.studio });
  f.world.add('game.Workspace.Garden', { class: 'Model', center: [0, 1, 40], size: [30, 2, 30] });
  f.world.add('game.Workspace.Coin1', { class: 'Part', center: [10, 1.5, 10], size: [2, 2, 2] });
  f.world.add('game.Workspace.Coin2', { class: 'Part', center: [-10, 1.5, 10], size: [2, 2, 2] });
  const hud = screen(f, 'HUD');
  hud.label('Cash', { text: '$0', pos: [0.02, 0, 0.02, 0], size: [0.18, 0, 0.06, 0] });
  const menu = hud.frame('Menu', { pos: [0.01, 0, 0.35, 0], size: [0.09, 0, 0.3, 0], bgT: 1 });
  f.world.add(menu + '.List', { class: 'UIListLayout' });
  for (const t of ['Shop', 'Seeds', 'Index']) hud.put(menu, t + 'Button', 'TextButton', { text: t, size: [1, 0, 0.3, 0] });
  hud.button('Collect', { text: 'Collect', pos: [0.5, 0, 0.9, 0], anchor: [0.5, 1], size: [0.16, 0, 0.07, 0] });
  const shop = screen(f, 'ShopGui');
  const panel = shop.frame('Panel', { visible: false, pos: [0.3, 0, 0.2, 0], size: [0.4, 0, 0.6, 0] });
  shop.put(panel, 'BuySeed', 'TextButton', { text: 'Buy Seed $10', pos: [0.1, 0, 0.3, 0], size: [0.8, 0, 0.2, 0] });
  shop.put(panel, 'Close', 'TextButton', { text: 'X', pos: [0.9, 0, 0, 0], size: [0.1, 0, 0.1, 0] });
  f.world.add('game.ServerScriptService.Economy', { class: 'Script', source: 'game.Players.PlayerAdded:Connect(function(p) local s = Instance.new("Folder") s.Name = "leaderstats" end)' });
  f.world.add('game.StarterGui.HUD.Client', { class: 'LocalScript', source: 'script.Parent.Menu.ShopButton.Activated:Connect(function() end)' });
  return { f, hud, shop };
}

const stat = (name, value) => ({ name, value });
/** A plugin report for one session; the defaults are a healthy session that earned nothing. */
export function report(o = {}) {
  return {
    completed: true, stage: 'done', requestedSeconds: 5, playerJoined: true, characterSpawned: true, clientReported: true, playerGuiFound: true,
    screenGuis: o.screens ?? [{ name: 'HUD', enabled: true, labels: [{ name: 'Cash', class: 'TextLabel', text: '$0', visible: true }, { name: 'ShopButton', class: 'TextButton', text: 'Shop', visible: true }] }],
    otherPlayerGuiChildren: [], clientErrors: o.clientErrors ?? [], clientWarnings: o.clientWarnings ?? [], serverErrors: o.serverErrors ?? [], serverWarnings: o.serverWarnings ?? [],
    leaderstatsBefore: o.before === undefined ? [stat('Cash', 0)] : o.before, leaderstatsAfter: o.after === undefined ? [stat('Cash', 0)] : o.after,
    touches: o.touches ?? [], presses: o.presses ?? [], leaderstatsAfterPresses: o.afterPresses === undefined ? null : o.afterPresses, harnessRemoved: true,
  };
}
export const press = (path, o = {}) => ({ path, found: true, visible: true, pressed: true, activated: true, activations: 1, changes: ['something changed'], ...o });

/**
 * What the good garden's play sessions report, the way the real game would answer: it starts with 20 Cash; walking onto a coin
 * pays 6; "Collect" pays more; the shop opens and "Buy Seed" costs 10 and gives a seed. `bad` breaks it in the ways the owner saw.
 */
export function gardenPlay(over = {}) {
  const cash = (v) => [{ name: 'Cash', value: v }];
  return (op, n) => {
    const presses = op.press ?? [];
    const named = (p) => p.split('.').pop();
    const result = (p, base) => {
      if (over.deadButtons) return press(p, { activated: false, changes: [] });
      const what = named(p);
      if (what === 'ShopButton') return press(p, { changes: ['ShopGui.Panel became visible'] });
      if (what === 'BuySeed') return press(p, { changes: over.noSpending ? [] : over.noEarning ? ['ShopGui.Toast became visible'] : ['leaderstats Cash 20 → 10', 'leaderstats Seeds none → 1'] });
      if (what === 'Collect') return press(p, { changes: over.noEarning ? ['HUD.Popup became visible'] : [`leaderstats Cash ${base} → ${base + 8}`] });
      return press(p, { changes: [`HUD.${what} became visible`] });
    };
    if (n === 2) return report({ before: cash(20), after: cash(over.noEarning ? 20 : 26), touches: (op.touch ?? []).map((t) => ({ path: t, found: true, moved: true, stillInPlace: true, leaderstatsAfter: cash(over.noEarning ? 20 : 26) })), presses: presses.map((p) => result(p, 26)), afterPresses: cash(34), ...over.report });
    return report({ before: cash(20), after: cash(20), presses: presses.map((p) => result(p, 20)), ...over.report });
  };
}
