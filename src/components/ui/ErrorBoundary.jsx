import { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-bg-primary">
          <div className="w-16 h-16 rounded-2xl bg-severity-critical/10 flex items-center justify-center mb-5">
            <AlertCircle size={32} className="text-severity-critical" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
          <p className="text-sm text-text-secondary mb-4 max-w-md text-center">
            An unexpected error occurred. This is usually caused by invalid data or a rendering issue.
          </p>
          {this.state.error && (
            <pre className="text-xs text-text-muted bg-bg-card border border-border-subtle rounded-lg p-3 mb-4 max-w-md overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-teal text-white text-sm font-medium hover:bg-accent-teal/90 transition-colors cursor-pointer"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
