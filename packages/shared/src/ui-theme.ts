// The composer's UI theme (V3 UI contract, Q6/Q19): the look of the INTERFACES StudPilot builds in a
// game. It never touches the world, the assets or the website, and `none` does not mean "no UI":
// it means StudPilot chooses the UI style itself and still builds a full interface.
export const UI_THEMES = ['studded', 'cartoony', 'none'] as const;
export type UiTheme = (typeof UI_THEMES)[number];
export const DEFAULT_UI_THEME: UiTheme = 'studded';

/** Anything that is not one of the three values is the default. */
export function asUiTheme(x: unknown): UiTheme {
  return (UI_THEMES as readonly unknown[]).includes(x) ? (x as UiTheme) : DEFAULT_UI_THEME;
}

/** The one line of per-run context the model sees for a request's UI theme. */
export function uiThemeContextLine(theme: UiTheme): string {
  switch (theme) {
    case 'cartoony':
      return 'UI theme for this request: cartoony — build every interface in the cartoony UI style.';
    case 'none':
      return 'UI theme: none — choose the UI style yourself; still build a full UI.';
    default:
      return 'UI theme for this request: studded — build every interface in the studded UI style: build_studded_ui (or build_object\'s screen), never insert_ui_component or build_ui.';
  }
}
