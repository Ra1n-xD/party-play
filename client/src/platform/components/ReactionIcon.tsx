import type { RoomReactionId } from "../../../../shared/platform/reactions";

/** Original PartyPlay stickers; identical artwork on every OS and in every game. */
export function ReactionIcon({ id, animated = false }: { id: RoomReactionId; animated?: boolean }) {
  return (
    <svg
      className={`reaction-icon reaction-icon-${id}${animated ? " is-animated" : ""}`}
      viewBox="0 0 64 64"
      fill="none"
      stroke="#282335"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m10 12 42-3 4 44-43 4Z" fill="#282335" stroke="none" />
      <path d="m7 8 43-3 5 44-43 4Z" fill={id === "fire" ? "#ffa74c" : "#e4b5f3"} />
      {id === "good-move" && (
        <g className="reaction-art">
          <path
            d="M24 44h-9V28h9m0 14 6 3h13l5-17a4 4 0 0 0-4-5h-8l1-9c-4-3-7 0-8 6l-5 8Z"
            fill="#d8fc61"
          />
          <path d="M20 37v3M44 15l3-3M48 20h4" />
        </g>
      )}
      {id === "bravo" && (
        <>
          <g className="reaction-clap-left">
            <path
              d="m15 43-3-14c-1-4 3-5 5-2l3 5-4-15c-1-4 4-5 5-1l6 18 1-9c0-4 5-4 5 0l-1 17-7 5Z"
              fill="#fff8e8"
            />
          </g>
          <g className="reaction-clap-right">
            <path
              d="m43 45 6-15c1-4-3-6-5-2l-4 6 5-17c1-4-4-5-5-1l-7 18v-9c0-4-5-4-5 0l1 17 6 6Z"
              fill="#d8fc61"
            />
          </g>
          <path className="reaction-spark" d="m28 13-1-5m7 6 3-5m-5 43 1 4" />
        </>
      )}
      {id === "wow" && (
        <g className="reaction-art">
          <path d="m18 17 23-2 5 25-13 8-16-9Z" fill="#fff8e8" />
          <path d="m19 23 5-2m11-1 5 1" />
          <path d="M24 27v3m13-4v3" strokeWidth="4" />
          <ellipse cx="31" cy="38" rx="4" ry="5" fill="#282335" />
          <path d="m47 13 2-5m-1 12 5-1" />
        </g>
      )}
      {id === "nice" && (
        <>
          <path
            className="reaction-art"
            d="m30 13 5 11 13 2-9 9 1 13-11-6-12 5 2-13-8-10 13-1Z"
            fill="#d8fc61"
          />
          <path className="reaction-spark" d="M45 11v7m-3-4h6M14 43v7m-3-4h6" />
        </>
      )}
      {id === "lucky" && (
        <g className="reaction-art">
          <path
            d="M32 32C8 32 10 11 24 18 28 6 45 13 32 32c17-18 28 0 14 6 8 13-12 23-14-6-6 24-26 11-15 1"
            fill="#d8fc61"
          />
          <path d="M32 33q3 10 10 15" />
          <path d="m44 13 3-4m1 10h4" />
        </g>
      )}
      {id === "fire" && (
        <>
          <path
            className="reaction-art"
            d="M32 10c3 13 16 16 14 28-1 9-9 14-18 10-12-4-15-16-7-24 0 6 4 8 5 8 5-7 1-13 6-22Z"
            fill="#fff8e8"
          />
          <path
            className="reaction-flame"
            d="M33 30c0 6 8 7 6 13-2 5-10 6-13 1-3-5 4-7 7-14Z"
            fill="#d8fc61"
          />
          <path className="reaction-spark" d="m17 16-2-5m32 11 4-3" />
        </>
      )}
    </svg>
  );
}
