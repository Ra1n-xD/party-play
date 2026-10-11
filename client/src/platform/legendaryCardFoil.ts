export type CardFoilSide = "face" | "back";
type FoilLayer = "foil" | "sparks";

interface FoilShape {
  path: string;
  fill?: boolean;
  width?: number;
  x?: number;
  y?: number;
  scale?: number;
}

const crownPath =
  "M -42 23 L -50 -20 L -24 -3 L 0 -38 L 24 -3 L 50 -20 L 42 23 Z M -42 29 H 42 V 37 H -42 Z";
const frameShapes: FoilShape[] = [
  {
    path: "M 23 7 H 233 Q 249 7 249 23 V 337 Q 249 353 233 353 H 23 Q 7 353 7 337 V 23 Q 7 7 23 7 Z",
    width: 8,
  },
  {
    path: "M 26 17 H 230 Q 239 17 239 26 V 334 Q 239 343 230 343 H 26 Q 17 343 17 334 V 26 Q 17 17 26 17 Z",
    width: 1.5,
  },
  { path: "M 232 91 L 236 97 L 232 103 L 228 97 Z", fill: true },
  { path: "M 24 257 L 28 263 L 24 269 L 20 263 Z", fill: true },
];

function star(x: number, y: number): FoilShape {
  return {
    path: `M ${x} ${y - 8} Q ${x + 1.5} ${y - 1.5} ${x + 8} ${y} Q ${x + 1.5} ${y + 1.5} ${x} ${y + 8} Q ${x - 1.5} ${y + 1.5} ${x - 8} ${y} Q ${x - 1.5} ${y - 1.5} ${x} ${y - 8} Z`,
    fill: true,
  };
}

function shapes(side: CardFoilSide, layer: FoilLayer): FoilShape[] {
  if (layer === "sparks")
    return [star(232, 97), star(24, 263), star(128, side === "face" ? 37 : 126)];
  return [
    ...frameShapes,
    {
      path: crownPath,
      fill: true,
      x: 128,
      y: side === "face" ? 54 : 169,
      scale: side === "face" ? 0.43 : 1.05,
    },
    ...(side === "face" ? [{ path: "M 128 303 L 134 312 L 128 321 L 122 312 Z", fill: true }] : []),
  ];
}

/** The same decoration-only mask serves DOM previews and the 3D material. */
export function cardFoilMaskImage(side: CardFoilSide, layer: FoilLayer): string {
  const paths = shapes(side, layer)
    .map((shape) => {
      const transform = shape.scale
        ? ` transform="translate(${shape.x} ${shape.y}) scale(${shape.scale})"`
        : "";
      return `<path d="${shape.path}" fill="${shape.fill ? "white" : "none"}" stroke="${shape.fill ? "none" : "white"}" stroke-width="${shape.width ?? 1}" stroke-linejoin="round"${transform}/>`;
    })
    .join("");
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 360">${paths}</svg>`)}")`;
}

export function drawCardFoilMask(
  ctx: CanvasRenderingContext2D,
  side: CardFoilSide,
  layer: FoilLayer,
) {
  ctx.save();
  ctx.clearRect(0, 0, 256, 360);
  ctx.fillStyle = ctx.strokeStyle = "#fff";
  ctx.lineJoin = "round";
  for (const shape of shapes(side, layer)) {
    ctx.save();
    if (shape.scale) {
      ctx.translate(shape.x ?? 0, shape.y ?? 0);
      ctx.scale(shape.scale, shape.scale);
    }
    const path = new Path2D(shape.path);
    ctx.lineWidth = shape.width ?? 1;
    if (shape.fill) ctx.fill(path);
    else ctx.stroke(path);
    ctx.restore();
  }
  ctx.restore();
}
