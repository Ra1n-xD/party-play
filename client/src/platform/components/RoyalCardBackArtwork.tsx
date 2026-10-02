import { royalCardBackImage } from "../royalCardArtwork";

export function RoyalCardBackArtwork({ game }: { game: "durak" | "uno" }) {
  return (
    <img
      className="card-back-artwork"
      src={royalCardBackImage(game)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
