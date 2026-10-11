import { CardBackArtwork } from "./CardBackArtwork";

export function RoyalCardBackArtwork({ game }: { game: "durak" | "uno" }) {
  return <CardBackArtwork game={game} skinId="royal" />;
}
