import { useState, type FormEvent } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
} from "../../../../shared/platform/auth";
import { useProfile } from "../context/ProfileContext";
import { normalizeNickname } from "../../../../shared/platform/cosmetics";

export function ProfileEditor() {
  const { profile, account, updateAccount, busy, connected, error, clearError } = useProfile();
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed =
    nickname.trim() !== profile?.nickname || email.trim() !== account?.email || !!newPassword;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setValidation(null);
    clearError();
    if (normalizeEmail(email) === null) {
      setValidation("Укажите корректную электронную почту или оставьте поле пустым");
      return;
    }
    if (newPassword !== confirmation) {
      setValidation("Новые пароли не совпадают");
      return;
    }
    const success = await updateAccount({
      nickname,
      email,
      currentPassword,
      ...(newPassword ? { newPassword } : {}),
    });
    // Passwords are never retained after a request, including a lost response.
    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setVisible(false);
    if (success) {
      setNickname(normalizeNickname(nickname)!);
      setEmail(normalizeEmail(email)!);
      setSaved(true);
    }
  };
  return (
    <section className="profile-editor" aria-labelledby="profile-editor-title">
      <header>
        <h2 id="profile-editor-title">Редактирование профиля</h2>
      </header>
      <form onSubmit={submit} onChange={() => setSaved(false)}>
        <div className="profile-editor-fields">
          <div className="profile-editor-field">
            <label htmlFor="edit-nickname">Никнейм</label>
            <input
              id="edit-nickname"
              name="username"
              autoComplete="username"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              aria-describedby="edit-nickname-hint"
              disabled={busy}
              required
            />
            <p id="edit-nickname-hint" className="profile-field-hint">
              Для смены ника выйдите из всех комнат.
            </p>
          </div>
          <div className="profile-editor-field">
            <label htmlFor="edit-email">
              Электронная почта <span className="profile-optional">(необязательно)</span>
            </label>
            <input
              id="edit-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={EMAIL_MAX_LENGTH}
              disabled={busy}
              aria-describedby="edit-email-hint"
              placeholder="you@example.com"
            />
            <p id="edit-email-hint" className="profile-field-hint">
              Вход и восстановление через почту пока недоступны.
            </p>
          </div>
        </div>
        <div className="profile-editor-fields">
          <div className="profile-editor-field">
            <label htmlFor="edit-new-password">
              Новый пароль <span className="profile-optional">(необязательно)</span>
            </label>
            <input
              id="edit-new-password"
              name="new-password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              disabled={busy}
              placeholder={`Не менее ${PASSWORD_MIN_LENGTH} символов`}
            />
          </div>
          <div className="profile-editor-field">
            <label htmlFor="edit-confirm-password">Повторите новый пароль</label>
            <input
              id="edit-confirm-password"
              name="new-password-confirm"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              maxLength={PASSWORD_MAX_LENGTH}
              disabled={busy}
              required={!!newPassword}
            />
          </div>
        </div>
        {newPassword && (
          <p className="profile-field-hint">
            После смены пароля другие устройства выйдут из аккаунта.
          </p>
        )}
        <div className="profile-editor-field">
          <label htmlFor="edit-current-password">Текущий пароль</label>
          <div className="profile-password-field">
            <input
              id="edit-current-password"
              name="current-password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              maxLength={PASSWORD_MAX_LENGTH}
              disabled={busy}
              required
            />
            <button
              type="button"
              className="profile-password-toggle"
              onClick={() => setVisible(!visible)}
              disabled={busy}
              aria-label={visible ? "Скрыть пароли" : "Показать пароли"}
              aria-pressed={visible}
            >
              {visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
            </button>
          </div>
        </div>
        {(validation || error) && (
          <p className="profile-error" role="alert">
            {validation || error}
          </p>
        )}
        {saved && (
          <p className="profile-save-success" role="status">
            Изменения сохранены.
          </p>
        )}
        <div className="profile-editor-actions">
          <button
            className="profile-primary"
            disabled={busy || !connected || !changed || !nickname.trim() || !currentPassword}
          >
            {busy ? "Сохраняем…" : "Сохранить изменения"}
          </button>
        </div>
        {!connected && (
          <p className="profile-field-hint" role="status">
            Нет связи с сервером. Дождитесь подключения, чтобы сохранить изменения.
          </p>
        )}
      </form>
    </section>
  );
}
