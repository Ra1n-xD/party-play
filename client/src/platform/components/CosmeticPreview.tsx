import type { CSSProperties } from "react";
import { getCardSkin, type Cosmetic } from "../../../../shared/platform/cosmetics";
import { AvatarPortrait } from "./AvatarPortrait";
import { CardFaceArtwork } from "./CardFaceArtwork";

export function CosmeticPreview({ item }: { item: Cosmetic }) {
  if (item.avatarId)
    return (
      <div className="cosmetic-avatar">
        <AvatarPortrait avatarId={item.avatarId} />
      </div>
    );
  const skin = getCardSkin(item.cardSkinId);
  const style = {
    "--skin-background": skin.background,
    "--skin-accent": skin.accent,
    "--skin-face": skin.face,
  } as CSSProperties;
  return (
    <div
      className={`cosmetic-deck is-${item.kind} skin-${skin.id}`}
      style={style}
      aria-hidden="true"
    >
      <div className="cosmetic-card-face">
        <CardFaceArtwork
          skinId={skin.id}
          face={
            item.kind === "durak"
              ? { game: "durak", rank: "Т", suit: "♥", red: true }
              : { game: "uno", rank: "+4", color: "wild" }
          }
        />
      </div>
      <div className="cosmetic-card-back">
        <span>{skin.mark}</span>
        <small>{item.kind === "durak" ? "ДУРАК" : "UNO"}</small>
      </div>
    </div>
  );
}
