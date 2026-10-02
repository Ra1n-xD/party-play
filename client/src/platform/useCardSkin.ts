import type { CSSProperties } from "react";
import { getCardSkin, type CardSkinId } from "../../../shared/platform/cosmetics";
import { usePlatform } from "./context/PlatformContext";
import { useProfile } from "./context/ProfileContext";

export function useCardSkin(game: "durak" | "uno", skinId?: CardSkinId) {
  const { snapshot } = usePlatform();
  const { profile } = useProfile();
  const ownSeat =
    snapshot?.viewer.role === "player"
      ? snapshot.seats.find(
          (seat) => snapshot.viewer.role === "player" && seat.seatId === snapshot.viewer.seatId,
        )
      : null;
  const skin = getCardSkin(skinId ?? ownSeat?.cardSkins[game] ?? profile?.equipped[game]);
  return {
    skin,
    props: {
      "data-card-skin": skin.id,
      style: {
        "--skin-background": skin.background,
        "--skin-accent": skin.accent,
        "--skin-face": skin.face,
      } as CSSProperties,
    },
  };
}
