import type { CardArtworkFace } from "./cardFaceArtwork";

const UNO_GEMS = {
  red: "#bd334e",
  yellow: "#efb943",
  green: "#16856b",
  blue: "#327dd0",
};

function gold(ctx: CanvasRenderingContext2D) {
  const foil = ctx.createLinearGradient(0, 0, 256, 360);
  foil.addColorStop(0, "#b87929");
  foil.addColorStop(0.22, "#fff0b5");
  foil.addColorStop(0.45, "#ba8131");
  foil.addColorStop(0.68, "#ffe9a0");
  foil.addColorStop(1, "#a46a22");
  return foil;
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.6, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.6, y);
  ctx.closePath();
  ctx.fill();
}

function crown(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width / 100, width / 100);
  ctx.fillStyle = gold(ctx);
  ctx.strokeStyle = "#fff0b5";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-42, 23);
  ctx.lineTo(-50, -20);
  ctx.lineTo(-24, -3);
  ctx.lineTo(0, -38);
  ctx.lineTo(24, -3);
  ctx.lineTo(50, -20);
  ctx.lineTo(42, 23);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(-42, 29, 84, 8);
  ctx.fillStyle = "#111c2b";
  for (const x of [-25, 0, 25]) diamond(ctx, x, 13, 5);
  ctx.fillStyle = "#fff1b2";
  for (const [x, y] of [
    [-50, -23],
    [0, -41],
    [50, -23],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function frame(ctx: CanvasRenderingContext2D) {
  const velvet = ctx.createLinearGradient(0, 0, 256, 360);
  velvet.addColorStop(0, "#090f1a");
  velvet.addColorStop(0.48, "#243144");
  velvet.addColorStop(1, "#080d16");
  ctx.fillStyle = velvet;
  ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = gold(ctx);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(7, 7, 242, 346, 16);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(17, 17, 222, 326, 9);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1;
  for (let i = 0; i < 32; i++) {
    const angle = (i * Math.PI) / 16;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(angle) * 73, 180 + Math.sin(angle) * 94);
    ctx.lineTo(128 + Math.cos(angle) * 108, 180 + Math.sin(angle) * 144);
    ctx.stroke();
  }
  ctx.restore();
  // Mirrored engraving leaves the corner values unobstructed.
  for (let i = 0; i < 2; i++) {
    ctx.save();
    if (i) {
      ctx.translate(256, 360);
      ctx.rotate(Math.PI);
    }
    ctx.strokeStyle = gold(ctx);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, 93);
    ctx.lineTo(24, 147);
    ctx.bezierCurveTo(52, 144, 47, 108, 30, 112);
    ctx.bezierCurveTo(13, 116, 39, 137, 39, 123);
    ctx.moveTo(70, 25);
    ctx.lineTo(96, 25);
    ctx.moveTo(160, 25);
    ctx.lineTo(222, 25);
    ctx.lineTo(222, 63);
    ctx.stroke();
    ctx.fillStyle = gold(ctx);
    diamond(ctx, 232, 97, 6);
    diamond(ctx, 24, 173, 5);
    ctx.restore();
  }
}

function crest(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(128, 91);
  ctx.lineTo(191, 117);
  ctx.lineTo(211, 184);
  ctx.lineTo(189, 249);
  ctx.lineTo(128, 279);
  ctx.lineTo(67, 249);
  ctx.lineTo(45, 184);
  ctx.lineTo(65, 117);
  ctx.closePath();
}

export function drawRoyalCardFace(ctx: CanvasRenderingContext2D, face: CardArtworkFace) {
  ctx.save();
  frame(ctx);
  ctx.save();
  crest(ctx);
  ctx.clip();
  if (face.game === "uno") {
    if (!face.color || face.color === "wild") {
      Object.values(UNO_GEMS).forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.fillRect(43 + (index % 2) * 85, 89 + Math.floor(index / 2) * 96, 85, 96);
      });
    } else {
      ctx.fillStyle = UNO_GEMS[face.color];
      ctx.fillRect(43, 89, 170, 192);
    }
    const facets = ctx.createLinearGradient(45, 100, 200, 270);
    facets.addColorStop(0, "#ffffff30");
    facets.addColorStop(0.45, "#00000000");
    facets.addColorStop(1, "#00000088");
    ctx.fillStyle = facets;
    ctx.fillRect(43, 89, 170, 192);
  } else {
    const enamel = ctx.createRadialGradient(128, 150, 10, 128, 185, 110);
    enamel.addColorStop(0, "#30445a");
    enamel.addColorStop(1, "#090f1a");
    ctx.fillStyle = enamel;
    ctx.fillRect(43, 89, 170, 192);
  }
  ctx.restore();
  crest(ctx);
  ctx.strokeStyle = gold(ctx);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.save();
  ctx.translate(128, 185);
  ctx.scale(0.9, 0.9);
  ctx.translate(-128, -185);
  crest(ctx);
  ctx.strokeStyle = "#ffe7a575";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  crown(ctx, 128, 54, 43);
  ctx.fillStyle = gold(ctx);
  diamond(ctx, 128, 312, 9);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#000b";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = face.game === "durak" ? (face.red ? "#ff7894" : gold(ctx)) : "#fff3cd";
  ctx.font = `bold ${face.game === "durak" ? 98 : face.rank.length > 1 ? 65 : 100}px Georgia, serif`;
  ctx.fillText(face.game === "durak" ? (face.suit ?? "♠") : face.rank, 128, 181);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#ffe6a4";
  ctx.font = "bold 22px Georgia, serif";
  ctx.fillText(face.game === "durak" ? face.rank : "UNO", 128, 243);
  for (let i = 0; i < 2; i++) {
    ctx.save();
    if (i) {
      ctx.translate(256, 360);
      ctx.rotate(Math.PI);
    }
    ctx.fillStyle = face.game === "durak" && face.red ? "#ff8aa1" : "#ffe6a4";
    ctx.font = `bold ${face.rank.length > 1 ? 30 : 38}px Georgia, serif`;
    ctx.fillText(face.rank, 39, 38);
    if (face.game === "durak") {
      ctx.font = "28px Georgia, serif";
      ctx.fillText(face.suit ?? "♠", 39, 71);
    } else {
      ctx.fillStyle = face.color && face.color !== "wild" ? UNO_GEMS[face.color] : "#ffe6a4";
      diamond(ctx, 39, 70, 8);
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawRoyalCardBack(ctx: CanvasRenderingContext2D, game: "durak" | "uno") {
  ctx.save();
  frame(ctx);
  ctx.strokeStyle = gold(ctx);
  ctx.fillStyle = "#111b2b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(128, 181, 80, 109, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(128, 181, 72, 101, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 9; i++) {
      ctx.save();
      const angle = -1.05 + i * 0.25;
      ctx.translate(128 + side * Math.cos(angle) * 94, 181 + Math.sin(angle) * 120);
      ctx.rotate(side * (angle + 0.5));
      ctx.fillStyle = gold(ctx);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  crown(ctx, 128, 169, 105);
  ctx.fillStyle = "#ffe6a4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px Georgia, serif";
  ctx.fillText("ЗОЛОТОЙ ВЕК", 128, 230);
  ctx.font = "bold 10px Arial, sans-serif";
  ctx.fillText(game === "uno" ? "UNO" : "ДУРАК", 128, 250);
  ctx.fillStyle = gold(ctx);
  diamond(ctx, 128, 52, 11);
  diamond(ctx, 128, 312, 11);
  ctx.restore();
}

const backs = new Map<string, string>();
export function royalCardBackImage(game: "durak" | "uno") {
  const cached = backs.get(game);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  drawRoyalCardBack(ctx, game);
  const image = canvas.toDataURL();
  backs.set(game, image);
  return image;
}
