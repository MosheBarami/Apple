/**
 * Connect Roblox Studio — the compact, contextual connection state.
 *
 * It lives at the foot of the conversation, not in a permanent sidebar and not
 * behind a full-screen setup wizard: it is a short prompt in the place where
 * the user is already looking, and it is gone the moment Studio is attached.
 *
 * TWO PROPERTIES THIS COMPONENT EXISTS TO GUARANTEE:
 *
 * 1. It disappears on connection and cannot come back while connected. That is
 *    not managed by an effect or a dismissal flag that could get out of step —
 *    `status === 'connected'` returns null, and `status` is derived on every
 *    render from the live socket. There is no local state here at all.
 *
 * 2. It never claims the plugin is installed. Nothing in this file can render
 *    such a claim, because no such state exists: the browser has no way to
 *    observe a Roblox Studio plugin, so step 1 is phrased as an action the user
 *    takes ("Get Apple Studio from the Creator Store"), never as a status we report.
 *
 * The install button's destination is STUDIO_PLUGIN_INSTALL_HREF, not the store
 * URL directly. Since 2026-09-22 the listing is distributed and that constant IS
 * the Creator Store page, opened in a new tab. If the listing is ever withdrawn,
 * STUDIO_PLUGIN_STORE_LIVE goes back to false and the same button quietly becomes
 * a same-origin link to /docs/plugin, which says what happened — no edit here.
 *
 * The steps name what the user actually sees, in the order they meet it: "Get
 * Plugin" on the web only adds it to their inventory, the Install happens in
 * Studio's Toolbox, the plugin's button is "Apple" in the Plugins tab, the code is
 * six characters, and edits stay off until allowed for that connection.
 */
import { STUDIO_PLUGIN_INSTALL_HREF, STUDIO_PLUGIN_STORE_LIVE } from '@golem/shared';
import type { StudioConnection } from '../../lib/studio-connection';
import { Icon, PATH } from './primitives';

interface ConnectStudioProps {
  status: StudioConnection;
  /** Opens the pairing-code dialog. */
  onPair: () => void;
  /**
   * The place this project is bound to, when the worker has told us one.
   *
   * IT IS THE WHOLE ANSWER FOR THE COMMONEST CASE. "Apple can't reach your place" is true and
   * useless; the reader's next question is which place, and the product already knows — the
   * pairing dialog two clicks away prints it. Naming it turns a shrug into an instruction, and
   * the instruction is usually "you have the wrong file open in Studio".
   */
  placeName?: string | null;
}

export function ConnectStudio({ status, onPair, placeName = null }: ConnectStudioProps) {
  // Attached. Say nothing; the workspace is the point, not the setup.
  if (status === 'connected') return null;

  // The socket has not answered yet, so we do not know. Showing a setup card to
  // someone who is already paired — for as long as a handshake takes — is worse
  // than showing one quiet line.
  if (status === 'connecting') {
    return (
      <p className="gx-connect gx-connect--quiet" role="status">
        <span className="gx-dot" aria-hidden="true" />
        Checking for Roblox Studio…
      </p>
    );
  }

  // Studio was here and went away. They plainly have the plugin, so the install
  // step is dropped rather than repeated at someone who is past it.
  const dropped = status === 'disconnected';

  return (
    <section className="gx-connect" aria-labelledby="gx-connect-title" data-tour="connect-studio">
      <h2 className="gx-connect__title" id="gx-connect-title">
        {dropped ? 'Roblox Studio disconnected' : 'Connect Roblox Studio'}
      </h2>
      <p className="gx-connect__lede">
        {dropped
          ? placeName
            ? `Apple is paired to ${placeName} and can’t reach it. Open ${placeName} in Studio — if you have a different place open, that is why — or pair again.`
            : 'Apple can’t reach your place right now. Open the Apple plugin in Studio, or pair again.'
          : STUDIO_PLUGIN_STORE_LIVE
            ? 'Apple works inside Roblox Studio through the free Apple Studio plugin. Set it up once.'
            : 'Public installation of the Studio plugin is unavailable right now. If you already have it, open it in Studio and pair below.'}
      </p>

      <ol className="gx-connect__steps">
        {!dropped && (
          <li className="gx-connect__step">
            <span className="gx-connect__what">{STUDIO_PLUGIN_STORE_LIVE ? 'Get Apple Studio from the Creator Store' : 'Public installation unavailable'}</span>
            <a
              className="gx-btn gx-btn--outline"
              href={STUDIO_PLUGIN_INSTALL_HREF}
              target={STUDIO_PLUGIN_STORE_LIVE ? '_blank' : undefined}
              rel={STUDIO_PLUGIN_STORE_LIVE ? 'noopener noreferrer' : undefined}
            >
              {STUDIO_PLUGIN_STORE_LIVE ? 'Get plugin' : 'See status'}
              {STUDIO_PLUGIN_STORE_LIVE && <Icon d={PATH.arrowUpRight} size={13} />}
            </a>
          </li>
        )}
        <li className="gx-connect__step">
          <span className="gx-connect__what">
            {STUDIO_PLUGIN_STORE_LIVE && !dropped
              ? 'In Studio, install it from the Toolbox, then click Apple in the Plugins tab'
              : 'In Studio, click Apple in the Plugins tab'}
          </span>
        </li>
        <li className="gx-connect__step">
          <span className="gx-connect__what">Get a 6-character code, type it into the Apple panel, then allow edits for this connection</span>
          {/* THE ONE PRIMARY ACTION ON THIS PANEL. Every other control here is secondary — the
              install link leaves the product, and the middle step has no control at all — so this
              is where docs/DESIGN-LOCK.md's single accent per screen is spent while Studio is
              detached. It cannot collide with the stage's live pip: that pip is only green once
              `status === 'connected'`, and this whole component returns null at that point. */}
          <button type="button" className="gx-btn gx-btn--primary" onClick={onPair}>
            Enter pairing code
          </button>
        </li>
      </ol>
    </section>
  );
}
