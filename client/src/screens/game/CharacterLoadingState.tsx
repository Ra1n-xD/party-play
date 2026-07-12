interface CharacterLoadingStateProps {
  error: string | null;
}

export function CharacterLoadingState({ error }: CharacterLoadingStateProps) {
  return (
    <main className="screen command-game-screen gs-loading-state" aria-live="polite">
      <div className="gs-loading-card">
        <span className="gs-loading-indicator" aria-hidden="true" />
        <h1>Готовим вашего персонажа</h1>
        <p>Карты появятся сразу после получения данных от сервера.</p>
      </div>
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
