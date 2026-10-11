import { getShipSkin, type ShipSkinId } from "../../../../shared/games/battleship/skins";
import "./battleship.css";

/** One continuous hull across all occupied cells, including single-cell patrol boats. */
export function ShipArtwork({
  skinId = "classic",
  length = 3,
  vertical = false,
}: {
  skinId?: ShipSkinId;
  length?: number;
  vertical?: boolean;
}) {
  const skin = getShipSkin(skinId);
  const width = length * 44;
  const bridge = width * 0.43;
  const pirate = skin.id === "corsair";
  return (
    <svg
      className="ship-artwork"
      viewBox={vertical ? `0 0 44 ${width}` : `0 0 ${width} 44`}
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform={vertical ? "translate(44 0) rotate(90)" : undefined}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path
          d={`M 6 10 Q ${width * 0.65} 4 ${width - 5} 22 Q ${width * 0.65} 40 6 34 Q 1 22 6 10 Z`}
          fill="#101e2b"
          opacity=".4"
          transform="translate(0 2)"
        />
        <path
          d={`M 6 8 Q ${width * 0.68} 3 ${width - 4} 22 Q ${width * 0.68} 41 6 36 Q 1 22 6 8 Z`}
          fill={skin.hull}
          stroke={skin.detail}
          strokeWidth="2"
        />
        <path
          d={`M 9 11 Q ${width * 0.64} 7 ${width - 10} 22 Q ${width * 0.64} 37 9 33 Z`}
          fill={skin.deck}
          stroke={skin.trim}
          strokeWidth="1.7"
        />
        <path
          d={`M 9 13 L ${width * 0.62} 13 M 9 31 L ${width * 0.62} 31`}
          stroke={skin.detail}
          strokeWidth=".8"
          opacity=".5"
        />
        {skin.id === "arctic" && (
          <path
            d={`M 10 12 L ${width * 0.28} 12 L ${width * 0.48} 32 L ${width * 0.35} 32 Z M ${width * 0.64} 15 l 12 4 -8 8 -12 -8 Z`}
            fill={skin.accent}
            opacity=".55"
          />
        )}
        {pirate ? (
          <>
            <path
              d={`M ${bridge} 9 V 35 M ${bridge - 7} 22 H ${Math.min(width - 10, bridge + 15)}`}
              stroke={skin.detail}
              strokeWidth="2.5"
            />
            <path
              d={`M ${bridge + 1} 10 Q ${bridge + 19} 19 ${bridge + 9} 32 L ${bridge + 1} 32 Z`}
              fill="#fff0c9"
              stroke={skin.detail}
              strokeWidth="1.2"
            />
            {length > 1 && (
              <path
                d={`M ${width * 0.7} 12 V 32 l 10 -4 Q ${width * 0.7 + 15} 17 ${width * 0.7} 12`}
                fill={skin.detail}
                stroke={skin.trim}
                strokeWidth="1"
              />
            )}
            <path d={`M 9 17 L 15 23 M 15 17 L 9 23`} stroke={skin.trim} strokeWidth="1.5" />
          </>
        ) : (
          <>
            <rect
              x={bridge - 7}
              y="14"
              width={length === 1 ? 12 : 22}
              height="16"
              rx="4"
              fill={skin.hull}
              stroke={skin.detail}
              strokeWidth="1.2"
            />
            <rect
              x={bridge - 4}
              y="17"
              width={length === 1 ? 7 : 14}
              height="10"
              rx="2"
              fill={skin.trim}
            />
            <path
              d={`M ${bridge - 2} 19 v 6 M ${bridge + 2} 19 v 6`}
              stroke={skin.detail}
              strokeWidth="1.3"
            />
            {length > 1 && (
              <>
                <circle
                  cx={width * 0.74}
                  cy="22"
                  r="5.5"
                  fill={skin.hull}
                  stroke={skin.detail}
                  strokeWidth="1.3"
                />
                <path d={`M ${width * 0.74} 22 h 12`} stroke={skin.detail} strokeWidth="3" />
                <path d={`M ${width * 0.74} 21 h 11`} stroke={skin.trim} strokeWidth="1.2" />
                <rect
                  x="12"
                  y="17"
                  width="9"
                  height="10"
                  rx="2"
                  fill={skin.hull}
                  stroke={skin.detail}
                  strokeWidth="1"
                />
              </>
            )}
            {length > 2 && (
              <path
                d={`M ${width * 0.29} 16 v 12 M ${width * 0.29 - 4} 22 h 8`}
                stroke={skin.detail}
                strokeWidth="2.2"
              />
            )}
          </>
        )}
        <path d={`M 7 10 v 24`} stroke={skin.accent} strokeWidth="3" />
        {skin.id === "royal" && length > 1 && (
          <path
            d={`M ${width * 0.57} 18 l 3 3 3 -5 3 5 3 -3 -2 8 h -8 Z`}
            fill={skin.trim}
            stroke={skin.detail}
            strokeWidth=".7"
          />
        )}
        <path
          d={`M 11 9 Q ${width * 0.65} 5 ${width - 9} 21`}
          stroke="#fff"
          strokeWidth="1"
          opacity=".4"
          fill="none"
        />
      </g>
    </svg>
  );
}
