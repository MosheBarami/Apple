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
 *    takes ("Install Golem for Studio"), never as a status we report.
 *
 * The install button's destination is STUDIO_PLUGIN_INSTALL_HREF, not the store
 * URL directly. As of 2026-08-31 the asset is uploaded but not distributed
 * (toolbox-service returns 404 for it), so the store page has nothing to get;
 * sending someone there would be the lie. While that is true the button goes to
 * /docs/plugin, which says so, and it becomes the store link automatically when
 * STUDIO_PLUGIN_STORE_LIVE flips.
 */
import { STUDIO_PLUGIN_INSTALL_HREF, STUDIO_PLUGIN_STORE_LIVE } from '@golem/shared';
import type { StudioConnection } from '../../lib/studio-connection';
import { Icon, PATH } from './primitives';

interface ConnectStudioProps {
  status: StudioConnection;
  /** Opens the pairing-code dialog. */
  onPair: () => void;
}

export function ConnectStudio({ status, onPair }: ConnectStudioProps) {
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
    <section className="gx-connect" aria-labelledby="gx-connect-title">
      <h2 className="gx-connect__title" id="gx-connect-title">
        {dropped ? 'Roblox Studio disconnected' : 'Connect Roblox Studio'}
      </h2>
      <p className="gx-connect__lede">
        {dropped
          ? 'Golem can’t reach your place right now. Open the Golem plugin in Studio, or pair again.'
          : 'Golem makes its changes inside Studio. Three steps, once.'}
      </p>

      <ol className="gx-connect__steps">
        {!dropped && (
          <li className="gx-connect__step">
            <span className="gx-connect__what">Install Golem for Studio</span>
            <a
              className="gx-btn gx-btn--outline"
              href={STUDIO_PLUGIN_INSTALL_HREF}
              target={STUDIO_PLUGIN_STORE_LIVE ? '_blank' : undefined}
              rel={STUDIO_PLUGIN_STORE_LIVE ? 'noopener noreferrer' : undefined}
            >
              Install
              {STUDIO_PLUGIN_STORE_LIVE && <Icon d={PATH.arrowUpRight} size={13} />}
            </a>
          </li>
        )}
        <li className="gx-connect__step">
          <span className="gx-connect__what">Open the Golem plugin in Studio</span>
        </li>
        <li className="gx-connect__step">
          <span className="gx-connect__what">Pair your project</span>
          <button type="button" className="gx-btn gx-btn--outline" onClick={onPair}>
            Enter pairing code
          </button>
        </li>
      </ol>
    </section>
  );
}
