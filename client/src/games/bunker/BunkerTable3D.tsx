import { useMemo, useState } from "react";
import type { RoundTableState } from "../shared/table3d/RoundTableScene";
import RoundTableView from "../shared/table3d/RoundTableView";
import { useTableHotkeys } from "../shared/table3d/useTableHotkeys";
import { useBunkerGame } from "./context/BunkerGameContext";
import { usePlatform } from "../../platform/context/PlatformContext";
import { AccessibleModal } from "../../platform/components/AccessibleModal";
import { CharacterDossier } from "../../screens/game/CharacterDossier";
import { ScenarioSummary } from "../../screens/game/ScenarioSummary";
import { buildGameScreenViewModel } from "../../screens/game/gameScreenViewModel";
import { TableTurnIndicator } from "../shared/table3d/TableTurnIndicator";
import { BUNKER_ATTRIBUTE_ICONS, BunkerAttributeIcon } from "./BunkerAttributeIcon";

interface Props {
  onCursorChange: (visible: boolean) => void;
  onClassic: () => void;
  onReveal?: () => void;
  onSpecial?: () => void;
  onManage?: () => void;
  onSkip?: () => void;
  vote?: {
    candidates: string[];
    selectedId: string | null;
    canVote: boolean;
    onSelect: (id: string) => void;
    onConfirm: (id: string) => void;
  };
}
export default function BunkerTable3D(props: Props) {
  const {
    gameState: game,
    playerId,
    isSpectator,
    myCharacter,
    myHasVoted,
    roomCode,
    connected,
    reconnectState,
  } = useBunkerGame();
  const { snapshot } = usePlatform();
  const [focused, setFocused] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [scenario, setScenario] = useState(false);
  const [roster, setRoster] = useState(false);
  const people = game?.players ?? [];
  const focusable = props.vote?.canVote
    ? people.filter((player) => props.vote?.candidates.includes(player.id))
    : people.filter((player) => isSpectator || player.id !== playerId);
  const cycle = (step: number) => {
    if (!focusable.length) return;
    const current = focusable.findIndex((player) => player.id === focused);
    const next =
      focusable[
        current < 0
          ? step > 0
            ? 0
            : focusable.length - 1
          : (current + step + focusable.length) % focusable.length
      ];
    setFocused(next.id);
    if (props.vote?.canVote) props.vote.onSelect(next.id);
  };
  const selectPerson = (id: string) => {
    setFocused(id);
    if (props.vote?.canVote && props.vote.candidates.includes(id)) props.vote.onSelect(id);
    else setDetails(id);
  };
  useTableHotkeys(true, (code) => {
    if (code === "KeyA" || code === "ArrowLeft") cycle(-1);
    else if (code === "KeyD" || code === "ArrowRight") cycle(1);
    else if (code === "KeyI" && !isSpectator) setDetails(playerId);
    else if (code === "KeyB") setScenario(true);
    else if (code === "KeyP") setRoster(true);
    else if (code === "Space" && focused) setDetails(focused);
    else if (code === "KeyE") {
      if (props.vote?.canVote) {
        const id = props.vote.selectedId ?? focused;
        if (id && props.vote.candidates.includes(id)) props.vote.onConfirm(id);
      } else props.onReveal?.();
    } else if (code === "KeyF") props.onSpecial?.();
    else if (code === "KeyH") props.onManage?.();
    else if (code === "KeyT") props.onSkip?.();
    else return false;
    return true;
  });
  const state = useMemo<RoundTableState>(
    () => ({
      people: (game?.players ?? []).map((player) => ({
        id: player.id,
        name: player.name,
        count: 0,
        active: game?.currentTurnPlayerId === player.id && !game.paused,
        isBot: player.isBot || Boolean(player.temporaryBot),
        selected: player.id === (props.vote?.selectedId ?? focused),
        muted: !player.alive,
        eliminated: !player.alive,
        eliminatedAt: player.eliminatedAt,
        detail: !player.alive
          ? player.kicked
            ? "Покинул игру"
            : "Изгнан"
          : !player.connected && !player.isBot
            ? "Нет связи"
            : player.temporaryBot
              ? "Временный бот"
              : game?.currentTurnPlayerId === player.id
                ? "Раскрывает карту"
                : player.isBot
                  ? "Бот"
                  : "За столом",
        traits: [
          ...player.revealedAttributes.map(({ type, label, value, detail }) => ({
            label,
            value,
            detail,
            kind: type,
            iconPath: BUNKER_ATTRIBUTE_ICONS[type],
          })),
          ...(player.actionCardRevealed && player.actionCard
            ? [
                {
                  label: "Особое условие",
                  value: player.actionCard.title,
                  detail: player.actionCard.description,
                  kind: "action",
                  iconPath: BUNKER_ATTRIBUTE_ICONS.action,
                },
              ]
            : []),
        ],
      })),
      viewerId: isSpectator ? null : playerId,
      cards: [],
      deckCount: 0,
      discardCount: 0,
      trump: null,
      takeSeatId: null,
    }),
    [game, playerId, isSpectator, focused, props.vote?.selectedId],
  );
  if (!game) return null;
  const view = buildGameScreenViewModel({ gameState: game, playerId, isSpectator, myCharacter });
  const chosen = people.find((player) => player.id === details);
  const myDetails = !isSpectator && chosen?.id === playerId;
  const voting = game.phase === "ROUND_VOTE" || game.phase === "ROUND_VOTE_TIEBREAK";
  const ownSeat = snapshot?.seats.find((seat) => seat.seatId === playerId);
  const shortcuts = [
    { label: "Игрок", keys: ["A", "D"] },
    { label: "Подробнее", keys: ["Пробел"] },
    ...(!isSpectator
      ? [
          { label: voting ? "Подтвердить голос" : "Раскрыть карту", keys: ["E"] },
          { label: "Особое условие", keys: ["F"] },
        ]
      : []),
    { label: "Ситуация", keys: ["B"] },
    { label: "Участники", keys: ["P"] },
    ...(props.onManage ? [{ label: "Управление", keys: ["H"] }] : []),
    ...(props.onSkip ? [{ label: "К голосованию", keys: ["T"] }] : []),
    ...(!isSpectator ? [{ label: "Мой персонаж", keys: ["I"] }] : []),
  ];
  return (
    <>
      <RoundTableView
        state={state}
        variant="bunker"
        roomCode={roomCode ?? ""}
        canSendLook={Boolean(
          !isSpectator &&
          ownSeat?.controllerKind === "human" &&
          connected &&
          reconnectState === "connected",
        )}
        paused={game.paused}
        onCursorChange={props.onCursorChange}
        onClassic={props.onClassic}
        menuActions={[
          { label: "Участники", key: "P", onSelect: () => setRoster(true) },
          { label: "Ситуация", key: "B", onSelect: () => setScenario(true) },
          ...(!isSpectator
            ? [{ label: "Мой персонаж", key: "I", onSelect: () => setDetails(playerId) }]
            : []),
          ...(props.onManage
            ? [{ label: "Управление комнатой", key: "H", onSelect: props.onManage }]
            : []),
        ]}
        title="СОВЕТ УБЕЖИЩА"
        shortcuts={shortcuts}
        onSelectPerson={selectPerson}
        focusedPerson={focused}
      >
        <div className="bunker3d-status">
          <span className="bunker3d-eyebrow">
            РАУНД {game.roundNumber} / {game.totalRounds} · МЕСТ {game.bunkerCapacity}
          </span>
        </div>
        <TableTurnIndicator
          label={
            voting
              ? game.phase === "ROUND_VOTE_TIEBREAK"
                ? "Переголосование"
                : "Голосование"
              : view.isMyTurn
                ? "Ваш ход"
                : view.currentTurnPlayer
                  ? `Ход: ${view.currentTurnPlayer.name}`
                  : view.phaseLabel
          }
          detail={
            voting
              ? myHasVoted
                ? "Ваш голос принят"
                : `${game.votesCount} / ${game.totalVotesExpected} голосов`
              : view.isMyTurn && view.canReveal
                ? game.roundNumber === 1
                  ? "Раскройте профессию"
                  : "Раскройте характеристику"
                : view.phaseDescription
          }
          isYourTurn={view.isMyTurn || Boolean(voting && props.vote?.canVote)}
          paused={game.paused}
          deadline={game.phaseEndTime}
        />
        <div className="bunker3d-table-caption">
          <span>СЦЕНАРИЙ КАТАСТРОФЫ</span>
          <strong>{game.catastrophe?.title ?? "Изучаем обстановку"}</strong>
        </div>
        <nav className="bunker3d-tools" aria-label="Материалы партии">
          <button type="button" onClick={() => cycle(-1)} aria-label="Предыдущий игрок">
            ←
          </button>
          <button type="button" onClick={() => cycle(1)} aria-label="Следующий игрок">
            →
          </button>
          <button type="button" onClick={() => setRoster(true)}>
            Участники <kbd>P</kbd>
          </button>
          <button type="button" onClick={() => setScenario(true)}>
            Ситуация <kbd>B</kbd>
          </button>
          {!isSpectator && (
            <button type="button" onClick={() => setDetails(playerId)}>
              Мой персонаж <kbd>I</kbd>
            </button>
          )}
        </nav>
      </RoundTableView>
      {scenario && (
        <AccessibleModal
          labelledBy="bunker3d-scenario-title"
          onClose={() => setScenario(false)}
          panelClassName="bunker3d-detail-modal"
        >
          <h2 id="bunker3d-scenario-title">Ситуация в бункере</h2>
          <ScenarioSummary
            idPrefix="bunker3d-scenario"
            gameState={game}
            expanded
            alwaysExpanded
            onToggle={() => undefined}
          />
          <button type="button" className="btn btn-secondary" onClick={() => setScenario(false)}>
            Закрыть
          </button>
        </AccessibleModal>
      )}
      {roster && (
        <AccessibleModal labelledBy="bunker3d-roster-title" onClose={() => setRoster(false)}>
          <h2 id="bunker3d-roster-title">Участники</h2>
          <div className="bunker3d-roster-list">
            {people.map((player) => (
              <button
                key={player.id}
                type="button"
                className="btn btn-target"
                onClick={() => {
                  setRoster(false);
                  setFocused(player.id);
                  setDetails(player.id);
                }}
              >
                {player.name}
                {player.id === playerId && !isSpectator ? " · Вы" : ""}
                {!player.alive ? " · изгнан" : ""}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setRoster(false)}>
            Закрыть
          </button>
        </AccessibleModal>
      )}
      {chosen && (
        <AccessibleModal
          labelledBy="bunker3d-person-title"
          onClose={() => setDetails(null)}
          panelClassName="bunker3d-detail-modal"
        >
          <h2 id="bunker3d-person-title">
            {chosen.name}
            {myDetails ? " · Ваш персонаж" : ""}
          </h2>
          {myDetails && myCharacter ? (
            <CharacterDossier
              character={myCharacter}
              revealedIndices={view.revealedIndices}
              alive={chosen.alive}
              actionCardRevealed={chosen.actionCardRevealed}
            />
          ) : (
            <div className="bunker3d-public-details">
              {chosen.revealedAttributes.length === 0 && <p>Характеристики ещё не раскрыты.</p>}
              {chosen.revealedAttributes.map((attribute) => (
                <article key={attribute.type} data-attr-type={attribute.type}>
                  <small>
                    <BunkerAttributeIcon type={attribute.type} />
                    {attribute.label}
                  </small>
                  <strong>{attribute.value}</strong>
                  {attribute.detail && <p>{attribute.detail}</p>}
                </article>
              ))}
              {chosen.actionCardRevealed && chosen.actionCard && (
                <article data-attr-type="action">
                  <small>
                    <BunkerAttributeIcon type="action" />
                    Особое условие
                  </small>
                  <strong>{chosen.actionCard.title}</strong>
                  <p>{chosen.actionCard.description}</p>
                </article>
              )}
            </div>
          )}
          <div className="modal-actions">
            {props.vote?.canVote && props.vote.candidates.includes(chosen.id) && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  props.vote?.onSelect(chosen.id);
                  setDetails(null);
                }}
              >
                Выбрать для голосования
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setDetails(null)}>
              Закрыть
            </button>
          </div>
        </AccessibleModal>
      )}
    </>
  );
}
