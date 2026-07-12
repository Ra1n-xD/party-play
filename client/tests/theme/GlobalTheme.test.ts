import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../src/styles/global.css", import.meta.url), "utf8");
const cardImageSource = readFileSync(
  new URL("../../src/components/CardImage.tsx", import.meta.url),
  "utf8",
);

const relativeLuminance = (hex: string) => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrastRatio = (first: string, second: string) => {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );

  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
};

test("global shell uses the command-center palette", () => {
  assert.match(
    css,
    /:root \{[^}]*--bg-primary: #07100c;[^}]*--bg-secondary: #101713;[^}]*--bg-card: rgba\(16, 23, 19, 0\.82\);/s,
  );
  assert.match(
    css,
    /:root \{[^}]*--accent: #efbd58;[^}]*--danger: #d9786c;[^}]*--success: #76c69e;/s,
  );
  assert.match(css, /body \{[^}]*rgba\(239, 189, 88, 0\.07\)[^}]*rgba\(118, 198, 158, 0\.05\)/s);
});

test("primary controls and shared surfaces use amber and graphite", () => {
  assert.match(
    css,
    /\.btn-primary \{[^}]*linear-gradient\(135deg, #f3c66b, #dda94a\);[^}]*color: #17150e;/s,
  );
  assert.match(css, /\.timer \{[^}]*background: rgba\(239, 189, 88, 0\.1\);/s);
  assert.match(css, /\.modal \{[^}]*background: rgba\(16, 23, 19, 0\.97\);/s);
});

test("danger fills keep readable text across their full gradient", () => {
  const dangerInk = "#07100c";
  const dangerStops = ["#d9786c", "#bd6259"];

  for (const stop of dangerStops) {
    assert.ok(contrastRatio(dangerInk, stop) >= 4.5, `${stop} must remain readable`);
  }

  assert.match(
    css,
    /\.btn-danger \{[^}]*linear-gradient\(135deg, #d9786c, #bd6259\);[^}]*color: #07100c;/s,
  );
  assert.match(
    css,
    /\.btn-vote \{[^}]*linear-gradient\(135deg, #d9786c, #bd6259\);[^}]*color: #07100c;/s,
  );
  assert.match(
    css,
    /\.eliminated-badge \{[^}]*linear-gradient\(135deg, #d9786c, #bd6259\);[^}]*color: #07100c;/s,
  );
  assert.match(css, /\.error-toast \{[^}]*rgba\(217, 120, 108, 0\.92\);[^}]*color: #07100c;/s);
  assert.match(css, /\.btn-remove-bot \{[^}]*background: var\(--danger\);[^}]*color: #07100c;/s);
});

test("home, lobby, vote, and results share the new accents", () => {
  assert.match(css, /\.logo h1 \{[^}]*linear-gradient\(135deg, #efbd58, #76c69e\);/s);
  assert.match(css, /\.room-code-value \{[^}]*linear-gradient\(135deg, #efbd58, #76c69e\);/s);
  assert.match(
    css,
    /\.vote-progress-fill \{[^}]*linear-gradient\(90deg, var\(--accent\), var\(--success\)\);/s,
  );
  assert.match(css, /\.results-container h2 \{[^}]*linear-gradient\(135deg, #efbd58, #76c69e\);/s);
});

test("global overlays and ambient details use the new shell", () => {
  assert.match(css, /\.pause-content h2 \{[^}]*linear-gradient\(135deg, #efbd58, #76c69e\);/s);
  assert.match(
    css,
    /\.phase-announcement-title \{[^}]*linear-gradient\(135deg, #efbd58, #76c69e\);/s,
  );
  assert.match(css, /\.action-toast \{[^}]*background: rgba\(118, 198, 158, 0\.92\);/s);
  assert.match(css, /\.particle \{[^}]*rgba\(118, 198, 158, 0\.7\)/s);
  assert.match(css, /\.spectator-badge \{[^}]*rgba\(118, 198, 158, 0\.1\)/s);
});

test("legacy purple shell colors are removed while semantic colors remain", () => {
  assert.doesNotMatch(
    css,
    /#8b5cf6|#7c3aed|#6d28d9|#5b21b6|#a855f7|rgba\(139, 92, 246|rgba\(168, 85, 247/,
  );

  const semanticColors = {
    profession: "#fbbf24",
    bio: "#fb923c",
    health: "#f87171",
    hobby: "#34d399",
    baggage: "#60a5fa",
    fact: "#22d3ee",
    action: "#c084fc",
  };

  for (const [type, color] of Object.entries(semanticColors)) {
    assert.match(css, new RegExp(`--card-${type}-color: ${color};`));
    assert.match(
      css,
      new RegExp(
        `\\.mini-tag\\[data-attr-type="${type}"\\] \\.mini-tag-label \\{[^}]*color: var\\(--card-${type}-color\\);`,
        "s",
      ),
    );
    assert.match(
      css,
      new RegExp(
        `\\[data-attr-type="${type}"\\] \\.mini-label,[\\s\\S]*?\\[data-attr-type="${type}"\\] \\.attr-label \\{[^}]*color: var\\(--card-${type}-color\\);`,
      ),
    );
    assert.match(
      css,
      new RegExp(
        `\\.result-tag\\[data-attr-type="${type}"\\] \\.result-tag-label \\{[^}]*color: var\\(--card-${type}-color\\);`,
        "s",
      ),
    );
    assert.match(
      cardImageSource,
      new RegExp(`${type}: \\{\\s*color: "var\\(--card-${type}-color, ${color}\\)"`, "s"),
    );
  }

  assert.match(
    css,
    /\.home-footer-socials a:nth-child\(1\):hover,[^}]*a:nth-child\(2\):hover \{[^}]*color: #26a5e4;/s,
  );
  assert.match(css, /\.home-footer-socials a:nth-child\(3\):hover \{[^}]*color: #9146ff;/s);
  assert.match(css, /\.home-footer-donate svg \{[^}]*color: #f57b22;/s);
});
