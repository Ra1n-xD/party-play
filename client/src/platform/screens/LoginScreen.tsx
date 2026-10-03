import { useState, type FormEvent } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../../../../shared/platform/auth";
import { INITIAL_COINS } from "../../../../shared/platform/cosmetics";
import { useProfile } from "../context/ProfileContext";
import { CoinAmount } from "../components/CoinAmount";

export function LoginScreen() {
  const { login, register, busy, connected, error, clearError } = useProfile();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const registering = mode === "register";
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setPassword("");
    setConfirmation("");
    setVisible(false);
    setValidation(null);
    clearError();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidation(null);
    if (registering && password !== confirmation) {
      setValidation("Пароли не совпадают");
      return;
    }
    const success = await (registering ? register : login)(name, password);
    if (success) {
      setPassword("");
      setConfirmation("");
    }
  };
  return (
    <main className="profile-login">
      <a href="/" className="profile-logo">
        partyplay<span> / CLUB</span>
      </a>
      <section>
        <span className="profile-eyebrow">ВАШ АККАУНТ</span>
        <h1>
          {registering ? (
            <>
              Свой ник.
              <br />
              Свой стиль.
            </>
          ) : (
            <>
              Снова вместе.
              <br />
              Снова в игре.
            </>
          )}
        </h1>
        <p>
          {registering
            ? "Создайте аккаунт, чтобы сохранять монеты, персонажей и карты."
            : "Войдите в свой аккаунт — ваша коллекция уже ждёт."}
        </p>
        <nav className="profile-auth-tabs" aria-label="Вход или регистрация">
          <button
            type="button"
            aria-pressed={!registering}
            disabled={busy}
            onClick={() => changeMode("login")}
          >
            Вход
          </button>
          <button
            type="button"
            aria-pressed={registering}
            disabled={busy}
            onClick={() => changeMode("register")}
          >
            Регистрация
          </button>
        </nav>
        <form onSubmit={submit}>
          <label htmlFor="profile-nickname">Никнейм</label>
          <input
            id="profile-nickname"
            name="username"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            autoComplete="username"
            placeholder="Ваш никнейм"
            autoFocus
            disabled={busy}
            required
          />
          <label htmlFor="profile-password">Пароль</label>
          <div className="profile-password-field">
            <input
              id="profile-password"
              name="password"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={registering ? "new-password" : "current-password"}
              minLength={registering ? PASSWORD_MIN_LENGTH : undefined}
              maxLength={PASSWORD_MAX_LENGTH}
              aria-describedby={registering ? "profile-password-hint" : undefined}
              placeholder={registering ? `Не менее ${PASSWORD_MIN_LENGTH} символов` : "Ваш пароль"}
              disabled={busy}
              required
            />
            <button
              type="button"
              className="profile-password-toggle"
              aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
              disabled={busy}
            >
              {visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
            </button>
          </div>
          {registering && (
            <>
              <small id="profile-password-hint" className="profile-password-hint">
                От {PASSWORD_MIN_LENGTH} до {PASSWORD_MAX_LENGTH} символов. Можно использовать
                длинную фразу с пробелами.
              </small>
              <label htmlFor="profile-password-confirm">Повторите пароль</label>
              <input
                id="profile-password-confirm"
                name="password-confirm"
                type={visible ? "text" : "password"}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                maxLength={PASSWORD_MAX_LENGTH}
                placeholder="Ещё раз тот же пароль"
                disabled={busy}
                required
              />
            </>
          )}
          {(validation || error) && (
            <p className="profile-error" role="alert">
              {validation || error}
            </p>
          )}
          <button
            className="profile-primary"
            disabled={
              busy || !connected || !name.trim() || !password || (registering && !confirmation)
            }
          >
            {busy
              ? registering
                ? "Создаём аккаунт…"
                : "Входим…"
              : registering
                ? "Создать аккаунт →"
                : "Войти →"}
          </button>
          {!connected && <p role="status">Подключаемся к серверу…</p>}
        </form>
        <a className="profile-guest-link" href="/">
          Играть без аккаунта
        </a>
        <div className="profile-welcome">
          <span className="profile-welcome-coins">
            <CoinAmount amount={INITIAL_COINS} label="монет при регистрации" />
          </span>
        </div>
        <small>Сохраните пароль: восстановление через почту пока недоступно.</small>
        <small className="profile-reset-note">
          Раньше играли только по нику? Старые профили сброшены. Создайте новый аккаунт с паролем.
        </small>
      </section>
    </main>
  );
}
