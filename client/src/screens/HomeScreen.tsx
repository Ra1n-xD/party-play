import { useState } from "react";
import { useGame } from "../context/GameContext";

export function HomeScreen() {
  const { createRoom, joinRoom, error } = useGame();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");

  const handleCreate = () => {
    if (name.trim()) createRoom(name.trim());
  };

  const handleJoin = () => {
    if (name.trim() && joinCode.trim()) joinRoom(joinCode.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="screen home-screen">
      <div className="home-container">
        <div className="logo">
          <h1>БУНКЕР</h1>
          <p className="subtitle">Игра на выживание</p>
        </div>

        {mode === "menu" && (
          <div className="home-actions">
            <input
              type="text"
              placeholder="Ваше имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              className="input"
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                if (name.trim()) setMode("create");
                handleCreate();
              }}
              disabled={!name.trim()}
            >
              Создать комнату
            </button>
            <div className="divider">
              <span>или</span>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setMode("join")}
              disabled={!name.trim()}
            >
              Присоединиться
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="home-actions">
            <p className="join-label">
              Имя: <strong>{name}</strong>
            </p>
            <input
              type="text"
              placeholder="Код комнаты"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="input input-code"
              autoFocus
            />
            <button className="btn btn-primary" onClick={handleJoin} disabled={joinCode.length < 4}>
              Войти
            </button>
            <button className="btn btn-text" onClick={() => setMode("menu")}>
              Назад
            </button>
          </div>
        )}

        {error && <div className="error-toast">{error}</div>}
      </div>
    </div>
  );
}
