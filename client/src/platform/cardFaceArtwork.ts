import { getCardSkin, type CardSkinId } from "../../../shared/platform/cosmetics";
import { drawRoyalCardBack, drawRoyalCardFace } from "./royalCardArtwork";

export interface CardArtworkFace {
  game: "durak" | "uno";
  rank: string;
  suit?: string;
  red?: boolean;
  color?: "red" | "yellow" | "green" | "blue" | "wild";
}

const FACE_COLORS = {
  classic: { paper: "#fffcf4", ink: "#202b32", red: "#b53838" },
  mint: { paper: "#e6fff2", ink: "#145b53", red: "#b02d54" },
  midnight: { paper: "#121936", ink: "#e3e8ff", red: "#ff91ac" },
  ember: { paper: "#281e25", ink: "#fff0de", red: "#ff9566" },
  aurora: { paper: "#292040", ink: "#c1ffe7", red: "#ff9fdc" },
  royal: { paper: "#111b2b", ink: "#ffe6a4", red: "#ff7894" },
};
const UNO_COLORS = ["#ce3e48", "#e6b939", "#258358", "#347bc5"];

// One drawing supplies collection previews, the 2D cards, and 3D textures.
export function drawCardFace(
  ctx: CanvasRenderingContext2D,
  face: CardArtworkFace,
  skinId: CardSkinId,
) {
  if (skinId === "royal") return drawRoyalCardFace(ctx, face);
  if (skinId === "classic") return drawClassicCardFace(ctx, face);
  const skin = getCardSkin(skinId);
  const palette = FACE_COLORS[skin.id];
  const serif = ["classic", "midnight"].includes(skin.id);
  const font = serif ? "Georgia, serif" : "Arial, sans-serif";
  ctx.save();
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = skin.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(9, 9, 238, 342, 12);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  if (skin.id === "mint") {
    for (let y = 85; y < 290; y += 18) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(128, y - 24);
      ctx.lineTo(232, y);
      ctx.stroke();
    }
  } else if (skin.id === "midnight") {
    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = skin.accent;
      ctx.beginPath();
      ctx.arc(22 + ((i * 79) % 212), 78 + ((i * 53) % 206), i % 3 ? 1 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const radius of [68, 91, 112]) {
      ctx.beginPath();
      ctx.arc(128, 180, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (skin.id === "ember") {
    ctx.fillStyle = skin.accent;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(18 + i * 45, 290);
      ctx.lineTo(45 + i * 38, 88);
      ctx.lineTo(65 + i * 38, 290);
      ctx.fill();
    }
  } else if (skin.id === "aurora") {
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = i % 2 ? "#80f5ce" : skin.accent;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(18, 85 + i * 24);
      ctx.bezierCurveTo(85, 15 + i * 29, 160, 285 + i * 4, 238, 93 + i * 24);
      ctx.stroke();
    }
  }
  ctx.restore();

  if (face.game === "uno") {
    const colorIndex = ["red", "yellow", "green", "blue"].indexOf(face.color ?? "wild");
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(22, 73, 212, 214, skin.id === "ember" ? 4 : 36);
    ctx.clip();
    if (colorIndex < 0) {
      UNO_COLORS.forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.fillRect(22 + (index % 2) * 106, 73 + Math.floor(index / 2) * 107, 106, 107);
      });
    } else {
      ctx.fillStyle = UNO_COLORS[colorIndex];
      ctx.fillRect(22, 73, 212, 214);
    }
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 100 + i * 40);
      ctx.lineTo(256, 20 + i * 40);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.fillStyle = palette.paper;
  ctx.strokeStyle = skin.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (skin.id === "ember") {
    ctx.moveTo(128, 98);
    ctx.lineTo(202, 142);
    ctx.lineTo(188, 238);
    ctx.lineTo(128, 267);
    ctx.lineTo(68, 238);
    ctx.lineTo(54, 142);
    ctx.closePath();
  } else if (skin.id === "mint") {
    ctx.roundRect(60, 107, 136, 146, 26);
  } else {
    ctx.ellipse(128, 180, 78, 86, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = face.game === "durak" && face.red ? palette.red : palette.ink;
  ctx.font = `bold ${face.game === "durak" ? 94 : face.rank.length > 1 ? 62 : 90}px ${font}`;
  ctx.fillText(face.game === "durak" ? (face.suit ?? "♠") : face.rank, 128, 184);
  ctx.fillStyle = skin.accent;
  ctx.font = `26px ${font}`;
  ctx.fillText(skin.mark, 128, 42);
  ctx.fillText(skin.mark, 128, 321);
  for (let i = 0; i < 2; i++) {
    ctx.save();
    if (i) {
      ctx.translate(256, 360);
      ctx.rotate(Math.PI);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = face.game === "durak" && face.red ? palette.red : palette.ink;
    ctx.font = `bold ${face.rank.length > 1 ? 30 : 38}px ${font}`;
    ctx.fillText(face.rank, 39, 36);
    if (face.game === "durak") {
      ctx.font = `28px ${font}`;
      ctx.fillText(face.suit ?? "♠", 39, 70);
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawClassicCardFace(ctx: CanvasRenderingContext2D, face: CardArtworkFace) {
  ctx.save();
  ctx.fillStyle = "#fffcf4";
  ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = "#d7cebc";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(10, 10, 236, 340, 13);
  ctx.stroke();
  if (face.game === "uno") {
    const colors = {
      red: "#c83c43",
      yellow: "#dfb73c",
      green: "#359573",
      blue: "#377dc6",
      wild: "#262b39",
    };
    ctx.fillStyle = colors[face.color ?? "wild"];
    ctx.beginPath();
    ctx.roundRect(13, 13, 230, 334, 12);
    ctx.fill();
    if (face.color === "wild") {
      Object.values(colors)
        .slice(0, 4)
        .forEach((color, index) => {
          ctx.fillStyle = color;
          ctx.fillRect(25 + (index % 2) * 103, 77 + Math.floor(index / 2) * 103, 103, 103);
        });
    }
    ctx.strokeStyle = "#fff8e9";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(128, 180, 83, 131, 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff8e9";
    ctx.textAlign = "center";
    ctx.font = `bold ${face.rank.length > 2 ? 58 : 92}px sans-serif`;
    ctx.shadowColor = "#0008";
    ctx.shadowBlur = 5;
    ctx.fillText(face.rank, 128, 211);
    ctx.shadowBlur = 0;
    ctx.font = "bold 38px sans-serif";
    ctx.fillText(face.rank, 55, 58);
    ctx.save();
    ctx.translate(256, 360);
    ctx.rotate(Math.PI);
    ctx.fillText(face.rank, 55, 58);
    ctx.restore();
  } else {
    ctx.fillStyle = face.red ? "#b53838" : "#202b32";
    for (let index = 0; index < 2; index++) {
      ctx.save();
      if (index) {
        ctx.translate(256, 360);
        ctx.rotate(Math.PI);
      }
      ctx.font = "bold 58px Georgia";
      ctx.fillText(face.rank, 21, 66);
      ctx.font = "48px Georgia";
      ctx.fillText(face.suit ?? "♠", 22, 114);
      ctx.restore();
    }
    ctx.textAlign = "center";
    ctx.font = "118px Georgia";
    ctx.fillText(face.suit ?? "♠", 128, 218);
  }
  ctx.restore();
}

export function drawCardBack(
  ctx: CanvasRenderingContext2D,
  game: "durak" | "uno",
  skinId: CardSkinId,
) {
  if (skinId === "royal") return drawRoyalCardBack(ctx, game);
  const skin = getCardSkin(skinId);
  ctx.save();
  ctx.fillStyle = skin.background;
  ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = skin.id === "classic" ? "#b9a474" : skin.accent;
  ctx.lineWidth = skin.id === "classic" ? 5 : 8;
  ctx.beginPath();
  ctx.roundRect(7, 7, 242, 346, 13);
  ctx.stroke();
  if (skin.id === "classic" && game === "uno") {
    ctx.fillStyle = "#262b39";
    ctx.beginPath();
    ctx.roundRect(13, 13, 230, 334, 12);
    ctx.fill();
    ctx.strokeStyle = "#fff8e9";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(128, 180, 83, 131, 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff8e9";
    ctx.textAlign = "center";
    ctx.font = "bold 58px sans-serif";
    ctx.fillText("UNO", 128, 211);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(18, 18, 220, 324);
    ctx.clip();
    ctx.lineWidth = skin.id === "classic" ? 1.5 : 2;
    ctx.globalAlpha = skin.id === "classic" ? 1 : 0.45;
    for (let i = -360; i < 620; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 360, 360);
      ctx.stroke();
      if (skin.id === "classic") {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i - 360, 360);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.fillStyle = skin.background;
    ctx.beginPath();
    ctx.arc(128, 180, skin.id === "classic" ? 52 : 65, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.accent;
    ctx.textAlign = "center";
    ctx.font = `${skin.id === "classic" ? 62 : 76}px Georgia`;
    ctx.fillText(skin.id === "classic" ? "♠" : skin.mark, 128, skin.id === "classic" ? 201 : 204);
    if (skin.id !== "classic") {
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(game === "uno" ? "UNO" : "PARTYPLAY", 128, 266);
    }
  }
  ctx.restore();
}

const backImages = new Map<string, string>();
export function cardBackImage(game: "durak" | "uno", skinId: CardSkinId): string {
  const key = `${game}:${skinId}`;
  const cached = backImages.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  drawCardBack(ctx, game, skinId);
  const image = canvas.toDataURL();
  backImages.set(key, image);
  return image;
}

const images = new Map<string, string>();
export function cardFaceImage(face: CardArtworkFace, skinId: CardSkinId): string {
  const key = `${skinId}:${face.game}:${face.rank}:${face.suit}:${face.red}:${face.color}`;
  const cached = images.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  drawCardFace(ctx, face, skinId);
  const image = canvas.toDataURL();
  images.set(key, image);
  return image;
}
