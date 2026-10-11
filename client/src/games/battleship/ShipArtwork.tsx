import { getShipSkin, type ShipSkinId } from "../../../../shared/games/battleship/skins";
import "./battleship.css";

type ShipDetails = {
  skin: ReturnType<typeof getShipSkin>;
  length: number;
  width: number;
};

function ConventionalShip({ skin, length, width }: ShipDetails) {
  const bridge = width * 0.43;
  return (
    <>
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
      <path d="M 7 10 v 24" stroke={skin.accent} strokeWidth="3" />
      <path
        d={`M 11 9 Q ${width * 0.65} 5 ${width - 9} 21`}
        stroke="#fff"
        strokeWidth="1"
        opacity=".4"
        fill="none"
      />
    </>
  );
}

function NorthernShip({ skin, length, width }: ShipDetails) {
  const shields = Array.from({ length: length + 1 }, (_, i) => 13 + ((width - 28) * i) / length);
  const mast = width * 0.5;
  const sailWidth = Math.min(30, width * 0.34);
  return (
    <>
      <path
        d={`M 5 22 Q ${width * 0.5} 4 ${width - 5} 22 Q ${width * 0.5} 40 5 22 Z`}
        fill="#122632"
        opacity=".5"
        transform="translate(0 2)"
      />
      {shields.map((x) => (
        <path
          key={`oar-${x}`}
          d={`M ${x} 17 l -5 -12 M ${x} 27 l -5 12`}
          stroke={skin.deck}
          strokeWidth="2"
        />
      ))}
      <path
        d={`M 4 22 Q ${width * 0.5} 1 ${width - 4} 22 Q ${width * 0.5} 43 4 22 Z`}
        fill={skin.hull}
        stroke={skin.detail}
        strokeWidth="1.7"
      />
      <path
        d={`M 10 22 Q ${width * 0.5} 7 ${width - 11} 22 Q ${width * 0.5} 37 10 22 Z`}
        fill={skin.deck}
        stroke={skin.trim}
        strokeWidth="1.1"
      />
      {[16, 21, 26].map((y) => (
        <path
          key={y}
          d={`M 15 ${y} H ${width - 16}`}
          fill="none"
          stroke={skin.detail}
          strokeWidth=".8"
          opacity=".65"
        />
      ))}
      {shields.map((x, i) => (
        <g key={x}>
          <circle
            cx={x}
            cy="12"
            r="3.8"
            fill={i % 2 ? skin.trim : skin.accent}
            stroke={skin.detail}
            strokeWidth="1"
          />
          <circle
            cx={x}
            cy="32"
            r="3.8"
            fill={i % 2 ? skin.accent : skin.trim}
            stroke={skin.detail}
            strokeWidth="1"
          />
          <path
            d={`M ${x - 2} 12 h 4 M ${x} 10 v 4 M ${x - 2} 32 h 4 M ${x} 30 v 4`}
            stroke={skin.hull}
            strokeWidth=".9"
          />
        </g>
      ))}
      <path
        d={`M 9 22 C 2 18 1 14 5 12 Q 9 11 9 15 M ${width - 9} 22 C ${width - 2} 18 ${width - 1} 13 ${width - 5} 11 Q ${width - 10} 10 ${width - 9} 15`}
        fill="none"
        stroke={skin.trim}
        strokeWidth="2.3"
      />
      <path d={`M ${mast} 8 V 35`} stroke={skin.detail} strokeWidth="2" />
      <path
        d={`M ${mast - sailWidth * 0.5} 8 Q ${mast + sailWidth * 0.67} 15 ${mast + sailWidth * 0.5} 33 Q ${mast - sailWidth * 0.57} 28 ${mast - sailWidth * 0.5} 8 Z`}
        fill={skin.trim}
        stroke={skin.detail}
        strokeWidth="1.2"
      />
      {[-0.27, 0.02, 0.3].map((offset) => (
        <path
          key={offset}
          d={`M ${mast + sailWidth * offset} ${9 + (offset + 0.3) * 5} Q ${mast + sailWidth * (offset + 0.16)} 21 ${mast + sailWidth * (offset + 0.07)} ${30 + offset * 3}`}
          fill="none"
          stroke={skin.accent}
          strokeWidth={sailWidth * 0.17}
        />
      ))}
      {length >= 3 && (
        <>
          <path d={`M ${width * 0.24} 13 V 31`} stroke={skin.detail} strokeWidth="1.6" />
          <path
            d={`M ${width * 0.24} 14 l 12 7 -12 8 Z`}
            fill={skin.accent}
            stroke={skin.detail}
            strokeWidth="1"
          />
        </>
      )}
      {length === 4 && (
        <path
          d={`M ${width * 0.67} 17 l 8 5 -8 5 Z`}
          fill={skin.trim}
          stroke={skin.detail}
          strokeWidth="1"
        />
      )}
    </>
  );
}

function GhostSail({ x, size, color }: { x: number; size: number; color: string }) {
  return (
    <g className="ship-ghost-sail">
      <path
        d={`M ${x} 6 V 35 M ${x - 3} 10 H ${x + size - 2}`}
        stroke="#bee8db"
        strokeWidth="1.2"
      />
      <path
        d={`M ${x + 1} 9 Q ${x + size} 11 ${x + size} 19 L ${x + size - 4} 21 L ${x + size - 1} 26 L ${x + size - 6} 25 L ${x + size - 7} 32 L ${x + size - 11} 27 L ${x + 1} 32 L ${x + 3} 24 L ${x + 1} 22 Z`}
        fill={color}
        fillOpacity=".88"
        stroke="#e1fff1"
        strokeWidth="1.1"
      />
      <path
        d={`M ${x + size * 0.4} 13 l 3 7 -4 -1 2 5 M ${x + size * 0.75} 17 l -2 5`}
        fill="none"
        stroke="#366f73"
        strokeWidth="1.2"
      />
    </g>
  );
}

function GhostShip({ skin, length, width }: ShipDetails) {
  const masts =
    length === 1 ? [width * 0.4] : length === 2 ? [width * 0.38] : [width * 0.28, width * 0.6];
  return (
    <>
      <path
        d={`M 6 18 Q ${width * 0.55} 4 ${width - 6} 22 Q ${width * 0.55} 40 6 30 Z`}
        fill={skin.accent}
        opacity=".12"
        stroke={skin.trim}
        strokeWidth="3"
      />
      <path
        d={`M 4 11 L ${width * 0.24} 8 L ${width * 0.29} 12 L ${width * 0.35} 7 L ${width * 0.67} 10 L ${width - 12} 14 Q ${width - 3} 18 ${width - 5} 25 L ${width - 10} 27 L ${width - 16} 32 L ${width * 0.72} 35 L ${width * 0.62} 31 L ${width * 0.55} 37 L ${width * 0.37} 34 L ${width * 0.31} 29 L ${width * 0.23} 35 L 5 33 L 8 27 L 3 23 L 7 18 Z`}
        fill={skin.hull}
        fillOpacity=".8"
        stroke={skin.trim}
        strokeWidth="1.6"
      />
      <path
        d={`M 12 14 L ${width * 0.3} 13 L ${width * 0.34} 16 L ${width * 0.4} 12 L ${width - 18} 18 L ${width - 12} 22 L ${width - 21} 27 L ${width * 0.6} 30 L ${width * 0.54} 27 L ${width * 0.45} 31 L 11 28 Z`}
        fill={skin.deck}
        stroke={skin.detail}
        strokeWidth="1"
      />
      {Array.from({ length: length + 1 }, (_, i) => 12 + (i * (width - 30)) / length).map((x) => (
        <path
          key={x}
          d={`M ${x} 12 q 5 10 0 21`}
          stroke={skin.trim}
          strokeWidth="1.1"
          opacity=".55"
          fill="none"
        />
      ))}
      <path
        d={`M ${width * 0.53} 12 l 4 6 -5 4 3 8 M 10 20 l 8 -2 -3 7`}
        stroke={skin.detail}
        strokeWidth="2"
        fill="none"
      />
      {length > 1 && (
        <>
          <path
            d="M 4 9 L 18 12 L 19 32 L 4 35 Z"
            fill={skin.detail}
            stroke={skin.trim}
            strokeWidth="1.1"
          />
          <path d="M 8 17 h 5 M 8 23 h 5 M 8 29 h 5" stroke={skin.accent} strokeWidth="1.5" />
          <path d={`M ${width - 16} 22 H ${width - 1}`} stroke={skin.trim} strokeWidth="1.7" />
        </>
      )}
      {masts.map((x) => (
        <GhostSail key={x} x={x} size={length === 1 ? 15 : 23} color={skin.trim} />
      ))}
      {length === 4 && (
        <>
          <path d={`M ${width * 0.78} 13 V 31`} stroke={skin.trim} strokeWidth="1.3" />
          <path
            d={`M ${width * 0.78 + 1} 13 l 16 4 -4 5 3 4 -7 -1 -8 5 Z`}
            fill={skin.accent}
            opacity=".85"
            stroke={skin.trim}
            strokeWidth="1"
          />
        </>
      )}
      <path
        d={`M ${width * 0.3} 39 q 9 -5 16 0 M ${width * 0.68} 4 q 7 5 15 0`}
        fill="none"
        stroke={skin.accent}
        strokeWidth="1.1"
        opacity=".6"
      />
    </>
  );
}

function DragonShip({ skin, length, width }: ShipDetails) {
  const head = width - 15;
  const tail = length === 1 ? 9 : 16;
  const mast = width * (length === 1 ? 0.43 : 0.47);
  const sailWidth = length === 1 ? 10 : 19;
  const fins =
    length === 1 ? [width * 0.44] : length === 2 ? [width * 0.4] : [width * 0.27, width * 0.58];
  return (
    <>
      <g className="ship-ocean">
        <path
          className="ship-ocean-wave"
          d={`M 4 7 Q ${width * 0.2} 2 ${width * 0.36} 7 T ${width * 0.7} 7 T ${width - 3} 7 M 3 37 Q ${width * 0.24} 42 ${width * 0.39} 37 T ${width * 0.72} 37 T ${width - 2} 37`}
          stroke="#6be8dc"
          strokeWidth="2.1"
          fill="none"
        />
        <path
          className="ship-ocean-wave ship-ocean-wave--foam"
          d={`M 8 4 Q ${width * 0.22} 1 ${width * 0.34} 4 M ${width * 0.65} 40 Q ${width * 0.8} 43 ${width - 6} 40 M 3 16 Q 0 22 3 27`}
          stroke="#d8fff1"
          strokeWidth="1.3"
          fill="none"
        />
        <path
          d={`M 7 13 Q ${width * 0.5} 2 ${width - 7} 19 Q ${width + 1} 22 ${width - 8} 30 Q ${width * 0.5} 43 7 31 Z`}
          fill="#70e4d2"
          opacity=".1"
        />
      </g>
      {fins.map((x) => (
        <g key={x} className="ship-dragon-fin">
          <path
            d={`M ${x - 7} 15 Q ${x - 5} 8 ${x - 1} 3 L ${x + 2} 7 L ${x + 7} 5 L ${x + 5} 15 Z M ${x - 7} 29 Q ${x - 5} 36 ${x - 1} 41 L ${x + 2} 37 L ${x + 7} 39 L ${x + 5} 29 Z`}
            fill={skin.accent}
            stroke={skin.trim}
            strokeWidth="1.1"
          />
          <path
            d={`M ${x - 1} 5 L ${x + 1} 13 M ${x + 4} 8 L ${x + 3} 14 M ${x - 1} 39 L ${x + 1} 31 M ${x + 4} 36 L ${x + 3} 30`}
            stroke={skin.detail}
            strokeWidth=".8"
          />
        </g>
      ))}
      <path
        d={`M ${tail} 16 C 8 11 3 13 3 18 C 2 23 8 24 8 20 C 8 17 6 17 5 19 M ${tail} 28 C 7 36 2 32 3 28`}
        fill="none"
        stroke={skin.trim}
        strokeWidth="3.2"
      />
      <path
        d={`M ${tail} 14 Q ${width * 0.49} 5 ${head + 2} 16 L ${head + 5} 22 L ${head + 2} 28 Q ${width * 0.49} 39 ${tail} 30 Q ${tail - 5} 22 ${tail} 14 Z`}
        fill={skin.hull}
        stroke={skin.trim}
        strokeWidth="1.7"
      />
      <path
        d={`M ${tail + 3} 17 Q ${width * 0.51} 11 ${head - 5} 18 L ${head - 1} 22 L ${head - 5} 26 Q ${width * 0.51} 33 ${tail + 3} 27 Z`}
        fill={skin.deck}
        stroke={skin.detail}
        strokeWidth="1"
      />
      {[18, 22, 26].map((y) => (
        <path
          key={y}
          d={`M ${tail + 5} ${y} H ${head - 6}`}
          stroke="#654933"
          strokeWidth=".9"
          fill="none"
        />
      ))}
      {length > 1 && (
        <path
          d={`M ${tail + 5} 15 l 4 -3 4 3 4 -3 4 3 M ${tail + 5} 29 l 4 3 4 -3 4 3 4 -3`}
          fill="none"
          stroke={skin.accent}
          strokeWidth="1.2"
        />
      )}
      <g className="ship-dragon-sail">
        <path
          d={`M ${mast} 10 V 34 M ${mast - 3} 12 H ${mast + sailWidth - 2}`}
          stroke={skin.trim}
          strokeWidth="1.5"
        />
        <path
          d={`M ${mast + 1} 12 Q ${mast + sailWidth + 4} 17 ${mast + sailWidth - 1} 30 Q ${mast + sailWidth * 0.5} 27 ${mast + 1} 32 Z`}
          fill={skin.accent}
          stroke={skin.trim}
          strokeWidth="1.1"
        />
        <path d={`M ${mast + sailWidth * 0.5} 17 l 3 4 -3 5 -2 -4 Z`} fill={skin.trim} />
      </g>
      {length >= 3 && (
        <>
          <path d={`M ${width * 0.28} 11 V 32`} stroke={skin.trim} strokeWidth="1.3" />
          <path
            d={`M ${width * 0.28 + 1} 13 Q ${width * 0.28 + 16} 17 ${width * 0.28 + 13} 28 L ${width * 0.28 + 1} 30 Z`}
            fill="#6d5197"
            stroke={skin.trim}
            strokeWidth="1"
          />
        </>
      )}
      {length === 4 && (
        <>
          <path d={`M ${width * 0.66} 12 V 31`} stroke={skin.trim} strokeWidth="1.2" />
          <path
            d={`M ${width * 0.66 + 1} 13 Q ${width * 0.66 + 16} 17 ${width * 0.66 + 12} 28 L ${width * 0.66 + 1} 30 Z`}
            fill="#9463bc"
            stroke={skin.trim}
            strokeWidth="1"
          />
        </>
      )}
      <g className="ship-dragon-head">
        <path
          d={`M ${head - 4} 15 Q ${head - 9} 10 ${head - 7} 4 Q ${head - 2} 6 ${head + 1} 13 Z M ${head + 1} 14 Q ${head + 2} 6 ${head + 7} 4 L ${head + 6} 15 Z`}
          fill={skin.trim}
          stroke={skin.detail}
          strokeWidth=".8"
        />
        <path
          d={`M ${head - 5} 18 Q ${head - 7} 11 ${head - 2} 11 Q ${head + 2} 10 ${head + 4} 15 Q ${head + 8} 14 ${head + 11} 17 L ${head + 13} 18 Q ${head + 15} 21 ${head + 12} 24 L ${head + 6} 25 Q ${head + 4} 32 ${head - 1} 32 Q ${head - 7} 31 ${head - 5} 24 Z`}
          fill={skin.hull}
          stroke={skin.trim}
          strokeWidth="1.2"
        />
        <path
          d={`M ${head - 4} 22 Q ${head - 1} 24 ${head - 1} 28 M ${head + 5} 17 Q ${head + 8} 16 ${head + 11} 18`}
          fill="none"
          stroke="#538c8c"
          strokeWidth="1.2"
        />
        <path
          d={`M ${head + 5} 23 Q ${head + 9} 26 ${head + 13} 22`}
          fill="none"
          stroke={skin.detail}
          strokeWidth="1.2"
        />
        <path d={`M ${head + 7} 24 l 1 3 2 -3`} fill="#fff2c5" />
        <ellipse
          cx={head + 1}
          cy="18"
          rx="2.7"
          ry="2.2"
          fill="#ffdb73"
          stroke={skin.detail}
          strokeWidth=".8"
        />
        <path d={`M ${head + 1} 16.7 v 2.6`} stroke={skin.detail} strokeWidth="1.1" />
        <circle cx={head + 0.3} cy="17.1" r=".55" fill="#fff8d2" />
        <ellipse cx={head + 11} cy="20" rx="1.1" ry=".8" fill={skin.detail} />
        <path
          d={`M ${head - 5} 25 l -3 2 4 2`}
          fill={skin.accent}
          stroke={skin.trim}
          strokeWidth=".7"
        />
      </g>
    </>
  );
}

/** Continuous, rarity-specific silhouettes share the same exact occupied-cell bounds. */
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
  const details = { skin, length, width };
  return (
    <svg
      className={`ship-artwork ship-artwork--${skin.id}`}
      viewBox={vertical ? `0 0 44 ${width}` : `0 0 ${width} 44`}
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform={vertical ? "translate(44 0) rotate(90)" : undefined}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {skin.id === "arctic" ? (
          <NorthernShip {...details} />
        ) : skin.id === "corsair" ? (
          <GhostShip {...details} />
        ) : skin.id === "royal" ? (
          <DragonShip {...details} />
        ) : (
          <ConventionalShip {...details} />
        )}
      </g>
    </svg>
  );
}
