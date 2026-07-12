import React from "react";
import type { Character } from "../../../../shared/types";
import { CardImage } from "../../components/CardImage";

export interface CharacterDossierProps {
  character: Character;
  revealedIndices: Set<number>;
  alive: boolean;
  actionCardRevealed: boolean;
}

function VisibilityStatus({ isRevealed }: { isRevealed: boolean }) {
  return isRevealed ? (
    <span className="gs-card-visibility is-public">Раскрыто всем</span>
  ) : (
    <span className="gs-card-visibility is-private">Не раскрыто</span>
  );
}

export function CharacterDossier({
  character,
  revealedIndices,
  alive,
  actionCardRevealed,
}: CharacterDossierProps) {
  return (
    <section className="gs-character-dossier" aria-label="Личное досье">
      <div className="gs-section-heading">
        <h2>Личное досье</h2>
        {!alive && <span className="gs-status-pill is-eliminated">Изгнан</span>}
      </div>
      <div className="gs-dossier-cards">
        {character.attributes.map((attribute, index) => (
          <article
            key={`${attribute.type}-${index}`}
            className="gs-dossier-card"
            data-attr-type={attribute.type}
          >
            <CardImage type={attribute.type} className="gs-dossier-card-image" />
            <div className="gs-dossier-card-copy">
              <span className="gs-dossier-card-label">{attribute.label}</span>
              <strong className="gs-dossier-card-value">{attribute.value}</strong>
              {attribute.detail && (
                <span className="gs-dossier-card-detail">{attribute.detail}</span>
              )}
              <VisibilityStatus isRevealed={revealedIndices.has(index)} />
            </div>
          </article>
        ))}

        <article className="gs-dossier-card" data-attr-type="action">
          <CardImage type="action" className="gs-dossier-card-image" />
          <div className="gs-dossier-card-copy">
            <span className="gs-dossier-card-label">Особое условие</span>
            <strong className="gs-dossier-card-value">{character.actionCard.title}</strong>
            <span className="gs-dossier-card-detail">{character.actionCard.description}</span>
            <VisibilityStatus isRevealed={actionCardRevealed} />
          </div>
        </article>
      </div>
    </section>
  );
}
