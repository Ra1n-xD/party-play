import type { AttributeType, Character, PlayerInfo } from "../../../shared/types";

export const ATTRIBUTE_ORDER: AttributeType[] = [
  "profession",
  "bio",
  "health",
  "hobby",
  "baggage",
  "fact",
];

export const ATTRIBUTE_LABELS: Record<AttributeType | "action", string> = {
  profession: "Профессия",
  bio: "Биология",
  health: "Здоровье",
  hobby: "Хобби",
  baggage: "Багаж",
  fact: "Особый факт",
  action: "Особое условие",
};

export interface PlayerAttributeSlot {
  type: AttributeType | "action";
  label: string;
  value: string | null;
  detail?: string;
  isPublic: boolean;
  isPrivate: boolean;
}

export function buildPlayerAttributeSlots(
  player: PlayerInfo,
  isMe: boolean,
  myCharacter: Character | null,
): PlayerAttributeSlot[] {
  const attributeSlots = ATTRIBUTE_ORDER.map((type) => {
    const publicAttribute = player.revealedAttributes.find((attribute) => attribute.type === type);
    const privateAttribute = isMe
      ? myCharacter?.attributes.find((attribute) => attribute.type === type)
      : undefined;
    const visibleAttribute = isMe ? privateAttribute : publicAttribute;
    const isPublic = Boolean(
      publicAttribute &&
      (!privateAttribute ||
        (publicAttribute.type === privateAttribute.type &&
          publicAttribute.value === privateAttribute.value)),
    );

    return {
      type,
      label: visibleAttribute?.label || ATTRIBUTE_LABELS[type],
      value: visibleAttribute?.value ?? null,
      detail: visibleAttribute?.detail,
      isPublic,
      isPrivate: Boolean(isMe && visibleAttribute && !isPublic),
    };
  });

  const publicActionCard = player.actionCardRevealed ? player.actionCard : undefined;
  const privateActionCard = isMe ? myCharacter?.actionCard : undefined;
  const visibleActionCard = isMe ? privateActionCard : publicActionCard;

  return [
    ...attributeSlots,
    {
      type: "action",
      label: ATTRIBUTE_LABELS.action,
      value: visibleActionCard?.title ?? null,
      detail: visibleActionCard?.description,
      isPublic: Boolean(publicActionCard),
      isPrivate: Boolean(isMe && visibleActionCard && !publicActionCard),
    },
  ];
}

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU") || "")
    .join("");
}

export function countRevealedCards(players: PlayerInfo[]): number {
  return players.reduce(
    (total, player) =>
      total + player.revealedAttributes.length + (player.actionCardRevealed ? 1 : 0),
    0,
  );
}

export function getPlayerStateLabel(
  player: PlayerInfo,
  currentTurnPlayerId: string | null,
  lastEliminatedPlayerId: string | null,
): string {
  if (currentTurnPlayerId === player.id) return "Говорит";
  if (lastEliminatedPlayerId === player.id) return "Изгнан · голосует";
  if (!player.alive) return "Изгнан";
  return "Слушает";
}
