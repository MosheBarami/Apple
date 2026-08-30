// Global error boundary — friendly crash card with reload.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Golem UI crashed:', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="crash-screen" role="alert">
          <div className="crash-card">
            <h1>The golem stumbled</h1>
            <p>Something broke in the interface — your projects and data are safe.</p>
            <pre className="crash-detail">{this.state.error.message}</pre>
            <div className="crash-actions">
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                Reload the app
              </button>
              <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
                Try to continue
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
