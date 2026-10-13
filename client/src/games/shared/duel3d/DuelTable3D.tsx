import { useEffect, useRef, useState } from "react";
import type { DuelTableScene } from "./DuelTableScene";
import type { DuelTableModel } from "./duelTableModel";
import "./duelTable3d.css";

interface Props {
  model: DuelTableModel;
  onCell: (cell: number) => void;
  onFallback: () => void;
}

export function DuelTable3D(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<DuelTableScene | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("./DuelTableScene")
      .then(({ DuelTableScene }) => {
        if (cancelled || !host.current) return;
        scene.current = new DuelTableScene(
          host.current,
          (cell) => latest.current.onCell(cell),
          () => latest.current.onFallback(),
        );
        scene.current.update(latest.current.model);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) latest.current.onFallback();
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => scene.current?.update(props.model), [props.model]);
  return (
    <section className="duel-table3d" aria-label="Дуэль за 3D-столом">
      <div className="duel-table3d-toolbar">
        <span>За столом · {props.model.opponent.name}</span>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={overview}
          disabled={!ready}
          onClick={() => {
            scene.current?.setOverview(!overview);
            setOverview(!overview);
          }}
        >
          {overview ? "За стол" : "Вид сверху"}
        </button>
      </div>
      <div ref={host} className="duel-table3d-stage" />
      {!ready && (
        <p className="duel-table3d-loading" role="status">
          Готовим 3D-стол…
        </p>
      )}
      <p className="duel-table3d-help">
        Нажмите на карту или клетку. Потяните поле в сторону, чтобы осмотреть стол.
      </p>
    </section>
  );
}
