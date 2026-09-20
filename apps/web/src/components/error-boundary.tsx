// The crash card, in two sizes.
//
// TWO BOUNDARIES, BECAUSE THEY RECOVER DIFFERENT THINGS.
//
//   scope="app" is the one in app.tsx, outside every provider and outside the router. It is the
//   last resort: if ThemeProvider or the router itself throws there is no shell left to render
//   into, so it takes the screen and the only honest action is a reload.
//
//   scope="route" is the one in the shell, around <Outlet/> alone. A route that throws is now a
//   pane that failed, not an application that died: the rail, the command palette and the toasts
//   are still mounted and still work, which matters because navigating away is what actually
//   recovers the user. The shell keys it on the pathname, so leaving the broken route remounts
//   the boundary and clears the crash — the root boundary cannot do this, having no route
//   identity to reset against, which is why its "Try to continue" used to re-render the same
//   crashing route and crash again.
//
// WHAT HAPPENS TO THE ERROR ITSELF.
//
// This header used to end "Nothing is reported to the server … the console is what exists, so the
// console is what is claimed." That is no longer true: `componentDidCatch` now also hands the
// error to lib/sentry.ts, which is a no-op returning `not_installed` when no DSN is configured.
//
// THE CONSOLE LINE STAYS, and it stays above the report rather than instead of it. A developer
// with devtools open is the fastest path from a crash to a cause, and reporting is an ADDITION to
// that, never a replacement — the failure shape this repository keeps finding is a mechanism that
// removed the old signal and then quietly failed to produce the new one.
//
// The report is deliberately not awaited and its outcome is deliberately not rendered. Whether
// Sentry accepted the event has nothing to do with whether this component can show the crash card,
// and a boundary that waits on the network before painting is a boundary that shows a white screen
// when the network is the thing that broke.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '../lib/sentry.ts';
import './error-boundary.css';

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
  /** 'app' takes the screen; 'route' fails inside the shell. Defaults to 'app'. */
  scope?: 'app' | 'route';
  /** Called when the reader asks to continue, after the caught error is dropped. */
  onReset?: () => void;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Apple UI crashed:', error, info.componentStack);
    // The component stack is NOT sent. It names this product's own files, which is diagnostic, but
    // it is also the one string here that grows without bound and is composed from rendered
    // content in development builds. The error and its own stack are what Sentry groups on.
    void captureException(error, { kind: 'react_boundary', scope: this.props.scope ?? 'app' });
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const route = this.props.scope === 'route';

    return (
      <div className={route ? 'crash-screen is-route' : 'crash-screen'} role="alert">
        <div className={route ? 'crash-card crash-card--route' : 'crash-card'}>
          <h1>The apple stumbled</h1>
          <p>
            {route
              ? 'This screen broke — the rest of the app is still working, and your projects and data are safe.'
              : 'Something broke in the interface — your projects and data are safe.'}
          </p>
          <pre className="crash-detail">{error.message}</pre>
          <div className="crash-actions">
            <button type="button" className="btn btn-primary" onClick={this.reset}>
              Try again
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload the app
            </button>
          </div>
          {route && (
            // Said out loud because it is the action that works: the same render that just threw
            // will usually throw again, and the rail beside this card is still live.
            <p className="crash-hint">If it breaks again, pick something else from the sidebar.</p>
          )}
        </div>
      </div>
    );
  }
}
