import type { CSSProperties } from "react";
import { cardFoilMaskImage, type CardFoilSide } from "../legendaryCardFoil";
import "../legendaryCardFoil.css";

const masks = {
  face: { foil: cardFoilMaskImage("face", "foil"), sparks: cardFoilMaskImage("face", "sparks") },
  back: { foil: cardFoilMaskImage("back", "foil"), sparks: cardFoilMaskImage("back", "sparks") },
};

export function LegendaryCardFoil({ side }: { side: CardFoilSide }) {
  return (
    <>
      <i
        className="legendary-card-foil"
        style={{ maskImage: masks[side].foil, WebkitMaskImage: masks[side].foil } as CSSProperties}
        aria-hidden="true"
      />
      <i
        className="legendary-card-sparks"
        style={
          { maskImage: masks[side].sparks, WebkitMaskImage: masks[side].sparks } as CSSProperties
        }
        aria-hidden="true"
      />
    </>
  );
}
