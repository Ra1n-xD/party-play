export const DROP_FEED_LIMIT = 24;

export interface CosmeticDrop {
  id: string;
  nickname: string;
  itemId: string;
  source: "case" | "upgrade";
  createdAt: number;
}
