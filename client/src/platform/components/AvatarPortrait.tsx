import { getAvatar, type AvatarId } from "../../../../shared/platform/avatars";

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

export function AvatarPortrait({ avatarId }: { avatarId: AvatarId }) {
  const avatar = getAvatar(avatarId);
  const { id } = avatar;
  const skin = hex(avatar.skin);
  const accent = hex(avatar.accent);
  const human = id === "human" || id === "astronaut";
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="avatar-portrait">
      <circle cx="60" cy="61" r="51" fill="#fff4d5" opacity=".12" />
      <path d="M17 120v-10c0-24 16-36 43-36s43 12 43 36v10" fill={hex(avatar.outfit)} />
      <path d="m47 80 13 28 13-28" fill="#f8eed8" />
      {(id === "cat" || id === "fox") && (
        <>
          <path d="M30 45 27 12 52 35M68 35 93 12 90 45" fill={skin} />
          <path d="m34 32-1-10 12 14m30 0 12-14-1 10" fill={accent} />
        </>
      )}
      {id === "rabbit" && (
        <>
          <ellipse cx="44" cy="26" rx="10" ry="25" fill={skin} transform="rotate(-9 44 26)" />
          <ellipse cx="77" cy="26" rx="10" ry="25" fill={skin} transform="rotate(9 77 26)" />
          <path d="M44 10v28m33-28v28" stroke={accent} strokeWidth="7" strokeLinecap="round" />
        </>
      )}
      {(id === "bear" || id === "panda") &&
        [34, 86].map((x) => (
          <g key={x}>
            <circle cx={x} cy="34" r="14" fill={id === "panda" ? accent : skin} />
            <circle cx={x} cy="34" r="8" fill={id === "panda" ? "#71655b" : accent} />
          </g>
        ))}
      {id === "alien" && (
        <g stroke={skin} strokeWidth="5" strokeLinecap="round">
          <path d="m43 36-9-19m43 19 9-19" />
          <circle cx="32" cy="14" r="5" fill="#f2d58b" />
          <circle cx="88" cy="14" r="5" fill="#f2d58b" />
        </g>
      )}
      {id === "robot" ? (
        <>
          <path d="M60 30V15" stroke={skin} strokeWidth="4" />
          <circle cx="60" cy="11" r="5" fill={accent} />
          <rect x="26" y="32" width="68" height="55" rx="13" fill={skin} />
          <rect x="32" y="43" width="56" height="30" rx="7" fill="#243541" />
          <path
            d="M41 54h9m20 0h9M51 66h18"
            stroke={accent}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M21 49v19m78-19v19" stroke="#627d91" strokeWidth="9" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse
            cx="60"
            cy="59"
            rx={id === "alien" ? 30 : 32}
            ry={human || id === "alien" ? 35 : 29}
            fill={skin}
          />
          {human && (
            <path d="M29 52c-9-38 55-48 64-15l-5 19-7-15c-9 7-26 5-33-1l-14 7Z" fill="#48322b" />
          )}
          {id === "dog" && (
            <g fill={accent}>
              <ellipse cx="29" cy="52" rx="11" ry="24" transform="rotate(12 29 52)" />
              <ellipse cx="91" cy="52" rx="11" ry="24" transform="rotate(-12 91 52)" />
            </g>
          )}
          {id === "panda" && (
            <g fill={accent}>
              <ellipse cx="46" cy="55" rx="12" ry="15" transform="rotate(-16 46 55)" />
              <ellipse cx="74" cy="55" rx="12" ry="15" transform="rotate(16 74 55)" />
            </g>
          )}
          {id === "alien" ? (
            <g fill={accent}>
              <ellipse cx="46" cy="56" rx="8" ry="13" transform="rotate(-16 46 56)" />
              <ellipse cx="74" cy="56" rx="8" ry="13" transform="rotate(16 74 56)" />
            </g>
          ) : (
            <g>
              <ellipse cx="46" cy="54" rx="7" ry="8" fill="#fff8e6" />
              <ellipse cx="74" cy="54" rx="7" ry="8" fill="#fff8e6" />
              <circle cx="47" cy="55" r="4" fill="#243541" />
              <circle cx="73" cy="55" r="4" fill="#243541" />
              <circle cx="45" cy="52" r="1.5" fill="#fff" />
              <circle cx="71" cy="52" r="1.5" fill="#fff" />
            </g>
          )}
          {!human && id !== "alien" && (
            <ellipse
              cx="60"
              cy="71"
              rx="19"
              ry="12"
              fill={id === "cat" || id === "rabbit" || id === "panda" ? "#f6ede6" : accent}
            />
          )}
          {human ? (
            <path d="M60 60v6" stroke="#c58970" strokeWidth="5" strokeLinecap="round" />
          ) : (
            id !== "alien" && (
              <path
                d="m55 66 10 0-5 6Z"
                fill={id === "rabbit" || id === "cat" ? "#ce879a" : "#302a29"}
              />
            )
          )}
          <path
            d="M53 77q7 6 14 0"
            fill="none"
            stroke={human ? "#975c4e" : "#55413a"}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {id === "rabbit" && <path d="M57 79h6v6h-6Z" fill="#fff" />}
          {id === "cat" && (
            <path
              d="m33 68-12-3m12 8-12 2m66-7 12-3m-12 8 12 2"
              stroke="#e5e2d7"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </>
      )}
      {id === "astronaut" && (
        <>
          <ellipse cx="60" cy="58" rx="39" ry="42" fill="none" stroke="#f0e7d5" strokeWidth="8" />
          <path d="M20 45v25m80-25v25" stroke={accent} strokeWidth="10" strokeLinecap="round" />
        </>
      )}
      {(id === "robot" || id === "astronaut") && (
        <rect x="48" y="96" width="24" height="16" rx="3" fill="#243541" />
      )}
    </svg>
  );
}
