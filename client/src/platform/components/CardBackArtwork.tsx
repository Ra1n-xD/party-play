import type { CardSkinId } from "../../../../shared/platform/cosmetics";
import { cardBackImage } from "../cardFaceArtwork";
import "../cardArtwork.css";

export function CardBackArtwork({ game, skinId }: { game: "durak" | "uno"; skinId: CardSkinId }) {
  return (
    <img
      className="card-back-artwork"
      src={cardBackImage(game, skinId)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
