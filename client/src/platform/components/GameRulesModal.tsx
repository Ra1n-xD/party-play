import type { GameId } from "../../../../shared/platform/gameContract";
import { FiBookOpen, FiX } from "react-icons/fi";
import type { GameRules } from "../gameRules";
import { AccessibleModal } from "./AccessibleModal";

interface GameRulesModalProps {
  gameId: GameId;
  gameTitle: string;
  rules: GameRules;
  onClose: () => void;
}

export function GameRulesModal({ gameId, gameTitle, rules, onClose }: GameRulesModalProps) {
  const titleId = `game-rules-${gameId}-title`;

  return (
    <AccessibleModal
      labelledBy={titleId}
      onClose={onClose}
      overlayClassName="game-rules-overlay"
      panelClassName={`game-rules-modal is-${rules.accent}`}
    >
      <header className="game-rules-heading">
        <div>
          <span>
            <FiBookOpen aria-hidden="true" /> Правила игры
          </span>
          <h2 id={titleId}>{gameTitle}</h2>
          <p>{rules.tagline}</p>
        </div>
        <button
          type="button"
          className="game-rules-close"
          onClick={onClose}
          aria-label="Закрыть правила"
        >
          <FiX aria-hidden="true" />
        </button>
      </header>

      <p className="game-rules-summary">{rules.summary}</p>

      <dl className="game-rules-facts">
        {rules.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="game-rules-sections">
        {rules.sections.map((section, index) => (
          <section key={section.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{section.title}</h3>
              {section.description && <p>{section.description}</p>}
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <aside className="game-rules-tips">
        <strong>Полезно помнить</strong>
        <ul>
          {rules.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </aside>
    </AccessibleModal>
  );
}
