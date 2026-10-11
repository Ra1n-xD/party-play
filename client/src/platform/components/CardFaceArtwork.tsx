import type { CardSkinId } from "../../../../shared/platform/cosmetics";
import { cardFaceImage, type CardArtworkFace } from "../cardFaceArtwork";

import "../cardArtwork.css";
import { LegendaryCardFoil } from "./LegendaryCardFoil";

export function CardFaceArtwork({ face, skinId }: { face: CardArtworkFace; skinId: CardSkinId }) {
  return (
    <>
      <img
        className="card-face-artwork"
        src={cardFaceImage(face, skinId)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {skinId === "royal" && <LegendaryCardFoil side="face" />}
    </>
  );
}
