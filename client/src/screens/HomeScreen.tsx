import { useState } from "react";
import { FaTelegramPlane, FaTwitch } from "react-icons/fa";
import { BiDonateHeart } from "react-icons/bi";
import { useGame } from "../context/GameContext";

export function HomeScreen() {
  const { createRoom, joinRoom, joinAsSpectator, error } = useGame();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"menu" | "create" | "join" | "spectate">("menu");

  const handleCreate = () => {
    if (name.trim()) createRoom(name.trim());
  };

  const handleJoin = () => {
    if (name.trim() && joinCode.trim()) joinRoom(joinCode.trim().toUpperCase(), name.trim());
  };

  const handleSpectate = () => {
    if (name.trim() && joinCode.trim()) joinAsSpectator(joinCode.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="screen home-screen">
      <div className="home-container">
        <div className="logo">
          <h1>БУНКЕР</h1>
          <p className="subtitle">💀 Игра на выживание 💀</p>
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
            <button
              className="btn btn-text"
              onClick={() => setMode("spectate")}
              disabled={!name.trim()}
            >
              Наблюдать
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

        {mode === "spectate" && (
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
            <button
              className="btn btn-primary"
              onClick={handleSpectate}
              disabled={joinCode.length < 4}
            >
              Наблюдать
            </button>
            <button className="btn btn-text" onClick={() => setMode("menu")}>
              Назад
            </button>
          </div>
        )}

        {error && <div className="error-toast">{error}</div>}
      </div>

      <footer className="home-footer">
        <div className="home-footer-socials">
          <a href="https://t.me/Ra1n_xD" target="_blank" rel="noopener noreferrer">
            <FaTelegramPlane /> Telegram
          </a>
          <a href="https://t.me/fronted_engineer" target="_blank" rel="noopener noreferrer">
            <FaTelegramPlane /> Канал
          </a>
          <a href="https://www.twitch.tv/fronted_ra1n" target="_blank" rel="noopener noreferrer">
            <FaTwitch /> Twitch
          </a>
        </div>
        <a
          className="home-footer-donate"
          href="https://www.donationalerts.com/r/fronted_ra1n"
          target="_blank"
          rel="noopener noreferrer"
        >
          <BiDonateHeart /> Поддержать проект
        </a>
      </footer>
    </div>
  );
}
