import { FiAlertTriangle } from "react-icons/fi";

export function TestAccountNotice({ showEmailWarning = false }: { showEmailWarning?: boolean }) {
  return (
    <div
      className={showEmailWarning ? "profile-password-warning" : "profile-test-notice"}
      id={showEmailWarning ? "profile-account-note" : undefined}
    >
      {showEmailWarning && <FiAlertTriangle aria-hidden="true" />}
      <div>
        <strong>Ваш аккаунт останется с вами</strong>
        <p>
          Аккаунт сохранится после релиза. Участники теста получат бонусы независимо от наличия
          почты.
        </p>
        {showEmailWarning && (
          <p>
            Почта пока только сохраняется: вход, подтверждение и восстановление через неё
            недоступны. Сохраните пароль.
          </p>
        )}
      </div>
    </div>
  );
}
