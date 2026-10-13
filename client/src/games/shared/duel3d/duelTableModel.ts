import type { AvatarId } from "../../../../../shared/platform/avatars";
import type { ShipSkinId } from "../../../../../shared/games/battleship/skins";
import type { PetAppearance } from "../../../../../shared/platform/pet";

export interface DuelTableCell {
  value: number | null;
  status?: "unknown" | "miss" | "hit" | "sunk";
  matched?: boolean;
  disabled: boolean;
  label: string;
}

/** Only the viewer's existing projection enters the scene; it never receives a full game. */
export interface DuelTableModel {
  kind: "memory" | "battleship";
  boardKey: string;
  cells: DuelTableCell[];
  ships?: number[][];
  skinId?: ShipSkinId;
  opponent: { name: string; avatarId?: AvatarId };
  companions: {
    ownerId: string;
    ownerName: string;
    isOwn: boolean;
    seat: "near" | "far";
    pet: PetAppearance;
  }[];
}
