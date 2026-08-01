import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PartyPlay render error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="screen platform-room-loading app-error-boundary" role="alert">
        <section className="platform-unsupported-game app-error-boundary-card">
          <span className="platform-loading-mark" aria-hidden="true">
            ◆
          </span>
          <h1>Что-то пошло не так</h1>
          <p>Обновите страницу. Если ошибка повторится, напишите нам — разберёмся.</p>
          <div className="app-error-boundary-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Обновить страницу
            </button>
            <a
              className="btn btn-secondary"
              href="https://t.me/Ra1n_xD"
              target="_blank"
              rel="noopener noreferrer"
            >
              Сообщить об ошибке
            </a>
          </div>
        </section>
      </main>
    );
  }
}
