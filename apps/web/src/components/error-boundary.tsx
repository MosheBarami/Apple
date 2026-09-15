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
// Nothing is reported to the server. There is no endpoint for client errors, and a call to a
// route that does not exist is the defect this codebase keeps finding; the console is what
// exists, so the console is what is claimed.
import { Component, type ErrorInfo, type ReactNode } from 'react';

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
