import { useId, type FormEvent } from "react";
import { FiArrowRight, FiEye } from "react-icons/fi";
import { ROOM_CODE_LENGTH, sanitizeRoomCodeInput } from "../../../../shared/roomCode";
import type { RoomVisibility } from "../../../../shared/platform/publicRooms";

export type RoomEntryMode = "join" | "create";

interface RoomEntryFormProps {
  mode?: RoomEntryMode;
  compact?: boolean;
  name: string;
  code: string;
  connected: boolean;
  pending: boolean;
  error: string | null;
  visibility: RoomVisibility;
  onNameChange: (name: string) => void;
  onCodeChange: (code: string) => void;
  onVisibilityChange: (visibility: RoomVisibility) => void;
  onSubmit: (event: FormEvent) => void;
  onSpectate: () => void;
  onModeChange?: (mode: RoomEntryMode) => void;
}

export function RoomEntryForm({
  mode = "join",
  compact = false,
  name,
  code,
  connected,
  pending,
  error,
  visibility,
  onNameChange,
  onCodeChange,
  onVisibilityChange,
  onSubmit,
  onSpectate,
  onModeChange,
}: RoomEntryFormProps) {
  const id = useId();
  const creating = mode === "create";
  const canSubmit =
    connected && !pending && !!name.trim() && (creating || code.length === ROOM_CODE_LENGTH);

  return (
    <section
      id="show-room-entry"
      className={`show-entry-panel${compact ? " is-compact" : ""}`}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>
        {creating ? "Ваше шоу!" : compact ? "Уже есть код?" : "Вы в игре?"}
      </h2>
      <p className="show-entry-description">
        {creating
          ? "Создайте комнату и пригласите компанию."
          : compact
            ? "Введите код от друга — и присоединяйтесь."
            : "Всего один код до первого хода."}
      </p>
      <form className="show-entry-form" onSubmit={onSubmit}>
        {!creating && (
          <label className="show-field">
            <span>Код комнаты</span>
            <input
              className="show-code-input"
              type="text"
              value={code}
              onChange={(event) => onCodeChange(sanitizeRoomCodeInput(event.target.value))}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCD"
              disabled={pending}
              aria-describedby={`${id}-code-hint`}
            />
            <small id={`${id}-code-hint`}>4 латинские буквы. Игра определяется по коду.</small>
          </label>
        )}
        <label className="show-field">
          <span>Ваше имя</span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={20}
            autoComplete="nickname"
            placeholder="Как вас зовут"
            disabled={pending}
          />
        </label>
        {creating && (
          <fieldset className="show-visibility" disabled={pending}>
            <legend>Кто сможет войти?</legend>
            {(
              [
                ["private", "Только по коду", "Отправьте код своим друзьям"],
                ["public", "Все желающие", "Комната появится в открытом списке"],
              ] as const
            ).map(([value, title, hint]) => (
              <label className={visibility === value ? "is-selected" : ""} key={value}>
                <input
                  type="radio"
                  name={`${id}-visibility`}
                  value={value}
                  checked={visibility === value}
                  onChange={() => onVisibilityChange(value)}
                />
                <span>
                  <strong>{title}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p className="show-entry-error" role="alert">
            {error}
          </p>
        )}
        <button className="show-primary" type="submit" disabled={!canSubmit}>
          {pending ? "Подключаемся…" : creating ? "Создать комнату" : "Подключиться"}
          {!pending && <FiArrowRight aria-hidden="true" />}
        </button>
        {!creating && (
          <button
            className="show-quiet show-spectator"
            type="button"
            onClick={onSpectate}
            disabled={!canSubmit}
          >
            <FiEye aria-hidden="true" /> Войти зрителем
          </button>
        )}
      </form>
      {!connected && (
        <p className="show-connection-note" role="status">
          Нет связи с сервером. Ждём подключения…
        </p>
      )}
      {onModeChange && (
        <div className="show-entry-bottom">
          <span>{creating ? "Друзья уже ждут?" : "Нет своей комнаты?"}</span>
          <button
            className="show-quiet"
            type="button"
            onClick={() => onModeChange(creating ? "join" : "create")}
            disabled={pending}
          >
            {creating ? "Ввести код" : "Создать"} <FiArrowRight aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
