import type { CaseId } from "../../../../shared/platform/cases";
import { BrandDice } from "./BrandDice";

export function CaseIcon({ caseId }: { caseId: CaseId }) {
  if (caseId === "partyplay") return <BrandDice />;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="#241d28"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {caseId === "avatar" && (
        <>
          <rect x="12" y="8" width="31" height="36" rx="5" fill="#241d28" stroke="none" />
          <g transform="rotate(-9 24 24)">
            <rect x="7" y="4" width="32" height="38" rx="5" fill="#c49ee2" />
            <path d="M11 38c1-9 23-9 25 0" fill="#778dde" />
            <path d="M16 30v5c4 3 8 3 12 0v-5" fill="#efb691" />
            <path d="M12 19c0-15 24-15 24 0v5c0 14-24 14-24 0z" fill="#f5d2a7" />
            <path d="M12 20c-1-15 22-16 24-2-6 0-8-6-9-9-2 6-8 10-15 11z" fill="#f5c84c" />
            <path d="M19 22v1m10-1v1" strokeWidth="3" />
            <path d="M21 28c2 2 4 2 6 0" />
            <circle cx="16" cy="26" r="1.5" fill="#ef947e" stroke="none" />
            <circle cx="32" cy="26" r="1.5" fill="#ef947e" stroke="none" />
          </g>
          <path d="m40 3 1.5 4L46 9l-4.5 1.5L40 15l-1.5-4.5L34 9l4.5-2z" fill="#ffcf67" />
        </>
      )}
      {caseId === "durak" && (
        <>
          <g transform="rotate(-16 18 25)">
            <rect x="6" y="9" width="25" height="33" rx="4" fill="#241d28" stroke="none" />
            <rect x="4" y="6" width="25" height="33" rx="4" fill="#eea9a5" />
            <path
              d="M11 21c-7-7-11 5 5 11 16-6 12-18 5-11-3-3-7-3-10 0z"
              fill="#bf4a40"
              stroke="none"
            />
            <path d="M9 12h4m-2-2v4" stroke="#bf4a40" />
          </g>
          <g transform="rotate(14 31 24)">
            <rect x="22" y="9" width="23" height="33" rx="4" fill="#241d28" stroke="none" />
            <rect x="19" y="6" width="23" height="33" rx="4" fill="#fff7e4" />
            <path d="M24 12v5m0-2 4-3m-4 3 4 3" strokeWidth="2" />
            <path
              d="M31 20c-7-10-15 3-6 5-2 7 9 8 6 1 7 7 14-4 6-6 0-6-6-6-6 0z"
              fill="#241d28"
              stroke="none"
            />
            <path d="m31 26-2 8h5l-2-8z" fill="#241d28" stroke="none" />
          </g>
        </>
      )}
      {caseId === "uno" && (
        <>
          <g transform="rotate(-20 15 26)">
            <rect x="5" y="9" width="22" height="34" rx="4" fill="#241d28" stroke="none" />
            <rect x="3" y="6" width="22" height="34" rx="4" fill="#ed6554" />
            <path d="M8 13h5m-5 5h5m0-5-5 5" stroke="#fff7e4" />
          </g>
          <g transform="rotate(-3 24 23)">
            <rect x="15" y="5" width="22" height="34" rx="4" fill="#241d28" stroke="none" />
            <rect x="13" y="3" width="22" height="34" rx="4" fill="#4d9abc" />
            <path d="M22 14h6v8m0-8-6 6m6-6-6-3" stroke="#fff7e4" />
          </g>
          <g transform="rotate(18 34 27)">
            <rect x="25" y="11" width="22" height="34" rx="4" fill="#241d28" stroke="none" />
            <rect x="23" y="8" width="22" height="34" rx="4" fill="#f4cd49" />
            <ellipse cx="34" cy="25" rx="7" ry="11" stroke="#fff7e4" strokeWidth="1.8" />
            <path d="M27 24h6m-3-3v6m8-6-4 5h6m-2-5v8" strokeWidth="2.6" />
          </g>
        </>
      )}
      {caseId === "reaction" && (
        <>
          <path
            d="M14 9h23a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-3l-1 8-9-8H14a6 6 0 0 1-6-6V15a6 6 0 0 1 6-6z"
            fill="#241d28"
            stroke="none"
          />
          <path
            d="M10 6h23a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H20l-9 8v-8h-1a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z"
            fill="#f4cd49"
          />
          <path d="M14 16v2m13-2v2" strokeWidth="3.4" />
          <path d="M13 23c4 6 10 6 15 0" fill="#fff7e4" />
          <path d="M36 6c-6-7-12 3 4 12 16-9 10-19 4-12-3-3-5-3-8 0z" fill="#ed9eb4" />
          <path d="m2 39 3-3m34 7 2 2" stroke="#d9b3e8" />
        </>
      )}
    </svg>
  );
}
