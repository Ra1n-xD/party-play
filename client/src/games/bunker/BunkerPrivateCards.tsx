import { useState } from "react";
import type { Character } from "../../../../shared/games/bunker/types";
import { AccessibleModal } from "../../platform/components/AccessibleModal";
import { BunkerAttributeIcon } from "./BunkerAttributeIcon";

interface Props {
  character: Character;
  revealedIndices: Set<number>;
  actionRevealed: boolean;
  roundNumber: number;
  canReveal: boolean;
  canRevealAction: boolean;
  onReveal?: (index: number) => void;
  onSpecial?: () => void;
}

export function BunkerPrivateCards(props: Props) {
  const [selected, setSelected] = useState<number | "action" | null>(null);
  const cards = [
    ...props.character.attributes.map((attribute, index) => ({
      id: index as number | "action",
      type: attribute.type,
      label: attribute.label,
      value: attribute.value,
      detail: attribute.detail,
      revealed: props.revealedIndices.has(index),
      canReveal:
        props.canReveal &&
        !props.revealedIndices.has(index) &&
        (props.roundNumber !== 1 || attribute.type === "profession"),
    })),
    {
      id: "action" as const,
      type: "action" as const,
      label: "Особое условие",
      value: props.character.actionCard.title,
      detail: props.character.actionCard.description,
      revealed: props.actionRevealed,
      canReveal: props.canRevealAction,
    },
  ];
  const chosen = cards.find((card) => card.id === selected);
  return (
    <>
      <section className="bunker3d-hand" aria-label="Ваши карты">
        <div className="bunker3d-hand-heading">
          Ваши карты <span>· только вам</span>
        </div>
        <div className="bunker3d-hand-cards">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`bunker3d-own-card${card.revealed ? " is-revealed" : ""}${card.canReveal ? " can-reveal" : ""}`}
              data-attr-type={card.type}
              aria-label={`${card.label}: ${card.value}. ${card.revealed ? "Раскрыто всем" : "Не раскрыто"}`}
              onClick={() => setSelected(card.id)}
            >
              <small>
                <BunkerAttributeIcon type={card.type} />
                {card.label}
              </small>
              <strong>{card.value}</strong>
              <span>
                {card.revealed ? "✓ Раскрыто" : card.canReveal ? "Можно раскрыть" : "Не раскрыто"}
              </span>
            </button>
          ))}
        </div>
      </section>
      {chosen && (
        <AccessibleModal
          labelledBy="bunker-own-card-title"
          onClose={() => setSelected(null)}
          panelClassName="bunker3d-own-card-modal"
        >
          <small>
            {chosen.label} · {chosen.revealed ? "Раскрыто всем" : "Видно только вам"}
          </small>
          <h2 id="bunker-own-card-title">{chosen.value}</h2>
          {chosen.detail && <p>{chosen.detail}</p>}
          <div className="modal-actions">
            {chosen.canReveal && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSelected(null);
                  if (chosen.id === "action") props.onSpecial?.();
                  else props.onReveal?.(chosen.id);
                }}
              >
                Раскрыть {chosen.id === "action" ? "особое условие" : "характеристику"}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
              Закрыть
            </button>
          </div>
        </AccessibleModal>
      )}
    </>
  );
}
