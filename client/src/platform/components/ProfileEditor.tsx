import { useState, type FormEvent } from "react";
import { FiEye, FiEyeOff, FiX } from "react-icons/fi";
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
} from "../../../../shared/platform/auth";
import { useProfile } from "../context/ProfileContext";
import { normalizeNickname } from "../../../../shared/platform/cosmetics";

export function ProfileEditor({ onClose }: { onClose(): void }) {
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
        <div>
          <span className="profile-eyebrow">ВАШ АККАУНТ</span>
          <h2 id="profile-editor-title">Редактирование профиля</h2>
        </div>
        <button
          type="button"
          className="profile-text-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Закрыть редактирование профиля"
        >
          <FiX aria-hidden="true" />
        </button>
      </header>
      <p className="profile-field-hint">
        Никнейм можно сменить после выхода из всех комнат. Монеты, коллекция, статистика и участие в
        тесте сохраняются.
      </p>
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
              disabled={busy}
              required
              autoFocus
            />
          </div>
          <div className="profile-editor-field">
            <label htmlFor="edit-email">Электронная почта · необязательно</label>
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
          </div>
        </div>
        <p id="edit-email-hint" className="profile-field-hint">
          Почта только сохраняется в аккаунте. Подтверждение и восстановление через неё пока
          недоступны. Поле можно оставить пустым или очистить.
        </p>
        <div className="profile-editor-fields">
          <div className="profile-editor-field">
            <label htmlFor="edit-new-password">Новый пароль · если хотите сменить</label>
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
        <p className="profile-field-hint">
          Оставьте оба поля пустыми, чтобы сохранить пароль. После смены пароля другие устройства
          выйдут из аккаунта.
        </p>
        <div className="profile-editor-field">
          <label htmlFor="edit-current-password">Текущий пароль для подтверждения</label>
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
          <button type="button" className="profile-text-button" onClick={onClose} disabled={busy}>
            Закрыть
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
