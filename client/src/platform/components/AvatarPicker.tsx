import { lazy, Suspense } from "react";
import { FiCheck } from "react-icons/fi";
import { AVATARS, getAvatar, type AvatarId } from "../../../../shared/platform/avatars";
import { AvatarPortrait } from "./AvatarPortrait";

const AvatarPreview = lazy(() => import("./AvatarPreview"));

export function AvatarPicker({
  avatarId,
  disabled,
  onSelect,
}: {
  avatarId: AvatarId;
  disabled: boolean;
  onSelect: (avatarId: AvatarId) => void;
}) {
  const chosen = getAvatar(avatarId);
  return (
    <section className="show-avatar-picker" aria-labelledby="avatar-picker-title">
      <div className="show-avatar-heading">
        <h2 id="avatar-picker-title">Ваш персонаж</h2>
        <span>10 на выбор</span>
      </div>
      <div className="show-avatar-content">
        <div className="show-avatar-stage">
          <Suspense fallback={<AvatarPortrait avatarId={chosen.id} />}>
            <AvatarPreview avatarId={chosen.id} />
          </Suspense>
          <strong aria-live="polite">{chosen.name}</strong>
        </div>
        <div className="show-avatar-options" role="group" aria-label="Выбор персонажа">
          {AVATARS.map((avatar) => (
            <button
              type="button"
              key={avatar.id}
              onClick={() => onSelect(avatar.id)}
              disabled={disabled}
              aria-pressed={chosen.id === avatar.id}
              aria-label={`Выбрать персонажа: ${avatar.name}`}
            >
              <AvatarPortrait avatarId={avatar.id} />
              <span>{avatar.name}</span>
              {chosen.id === avatar.id && (
                <FiCheck className="show-avatar-check" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
