// CLOUDFLARE TURNSTILE ON THE DOORS ANYONE CAN KNOCK ON (D-VISION-1).
//
// Sign-up, sign-in, "send the link again", "forgot password" and the account-recovery request are
// the forms a script can hammer without an account: fake sign-ups, password guessing, and mail
// bombs sent to somebody else's inbox. Each now asks Turnstile for a one-use token first and hands
// it to whoever checks it — Supabase Auth (its built-in captcha, `captchaToken`) or the worker
// (`/api/recovery-request`, see apps/worker/src/turnstile.ts).
//
// INVISIBLE FOR PEOPLE. The widget is `interaction-only`: most visitors never see it; the few
// Cloudflare is unsure about get one checkbox, pinned at the bottom of the screen, not a puzzle.
//
// NEVER A DEAD END ON THIS SIDE. A blocked script, a timeout or a widget error resolves to `null`
// and the form submits without a token. Whether that is acceptable is the checker's decision
// (Supabase or the worker), which answers with a sentence the page already knows how to show.

/** Public by design — a site key is embedded in every page that shows the widget. */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFBZMmzRjP_TyIk5';
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 60_000;

export type TurnstileAction = 'signin' | 'signup' | 'resend' | 'reset' | 'recovery' | 'reauth';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string | undefined;
  remove(id: string): void;
}

export interface TurnstileDeps {
  /** Resolves the loaded `window.turnstile`, or rejects. */
  load: () => Promise<TurnstileApi>;
  /** Where the widget lives while it works; removed afterwards. */
  mount: () => { el: HTMLElement; dispose: () => void };
  siteKey?: string;
  timeoutMs?: number;
}

let loading: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_SCRIPT;
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile missing')));
    s.onerror = () => {
      loading = null; // let the next attempt try again
      reject(new Error('turnstile blocked'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

function mountFloating(): { el: HTMLElement; dispose: () => void } {
  const el = document.createElement('div');
  el.setAttribute('data-turnstile', '');
  el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000';
  document.body.appendChild(el);
  return { el, dispose: () => el.remove() };
}

/** A fresh one-use token for `action`, or null when none could be had. Never rejects. */
export async function turnstileToken(action: TurnstileAction, deps?: Partial<TurnstileDeps>): Promise<string | null> {
  if (!deps?.load && typeof document === 'undefined') return null;
  const load = deps?.load ?? loadScript;
  const mount = deps?.mount ?? mountFloating;
  let api: TurnstileApi;
  try {
    api = await load();
  } catch {
    return null;
  }
  const { el, dispose } = mount();
  let id: string | undefined;
  const token = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), deps?.timeoutMs ?? TIMEOUT_MS);
    const done = (t: string | null) => {
      clearTimeout(timer);
      resolve(t);
    };
    try {
      id = api.render(el, {
        sitekey: deps?.siteKey ?? TURNSTILE_SITE_KEY,
        action,
        appearance: 'interaction-only',
        callback: (t: string) => done(typeof t === 'string' && t ? t : null),
        'error-callback': () => done(null),
        'expired-callback': () => done(null),
        'timeout-callback': () => done(null),
      });
    } catch {
      done(null);
    }
  });
  try {
    if (id) api.remove(id);
  } catch {
    /* already gone */
  }
  dispose();
  return token;
}

/** Supabase Auth's shape: `captchaToken` present only when there is one. */
export function captchaOptions(token: string | null): { captchaToken?: string } {
  return token ? { captchaToken: token } : {};
}
