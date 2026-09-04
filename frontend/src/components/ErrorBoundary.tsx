import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown above the reload button, e.g. the section that failed. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Stops one broken page from blanking the whole app.
 *
 * React unmounts the entire tree when a render throws, which is what produced
 * a white screen with no explanation. This catches the throw and shows the
 * error instead, so the failure is visible and recoverable.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the stack in the console for debugging.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="text-5xl" aria-hidden="true">
          ⚠️
        </span>
        <h1 className="text-xl font-bold text-dark">
          {this.props.label ?? "This page hit an error"}
        </h1>
        <p className="max-w-md text-sm text-gray-500">
          Something went wrong while displaying this page. Nothing was saved or
          changed. Try again, and report this if it keeps happening.
        </p>
        <p className="max-w-md break-words rounded-xl bg-secondary px-4 py-2.5 font-mono text-xs text-gray-500">
          {error.message}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="cursor-pointer rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-full border border-gray px-6 py-2.5 text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
