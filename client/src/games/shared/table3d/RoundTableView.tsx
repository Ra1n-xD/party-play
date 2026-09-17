import { useEffect, useRef, useState, type ReactNode } from "react";
import { RoundTableScene, type RoundTableState, type TableSceneOptions } from "./RoundTableScene";
import { useTablePresence } from "./useTablePresence";
import "./table3d.css";

export interface TableShortcut {
  label: string;
  keys: string[];
  active?: boolean;
}
interface Props {
  state: RoundTableState;
  variant: "uno" | "bunker";
  roomCode: string;
  canSendLook: boolean;
  paused: boolean;
  cursorVisible: boolean;
  onCursorChange: (visible: boolean) => void;
  onClassic: () => void;
  title: string;
  shortcuts: TableShortcut[];
  onSelectPerson?: TableSceneOptions["onSelectPerson"];
  focusedPerson?: string | null;
  children?: ReactNode;
}

export default function RoundTableView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<RoundTableScene | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [failed, setFailed] = useState(false);
  const sendLook = useTablePresence(props.roomCode, props.canSendLook, (event) =>
    scene.current?.receiveLook(event),
  );
  useEffect(() => {
    if (!host.current || !labels.current) return;
    const fail = () => {
      setFailed(true);
      latest.current.onCursorChange(true);
    };
    try {
      scene.current = new RoundTableScene(
        host.current,
        labels.current,
        sendLook,
        (visible) => latest.current.onCursorChange(visible),
        fail,
        { variant: props.variant, onSelectPerson: (id) => latest.current.onSelectPerson?.(id) },
      );
    } catch {
      fail();
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    scene.current?.update(props.state);
  }, [props.state]);
  useEffect(() => {
    if (props.paused) scene.current?.releaseCursor();
  }, [props.paused]);
  useEffect(() => {
    if (props.focusedPerson) scene.current?.focusPerson(props.focusedPerson);
  }, [props.focusedPerson]);
  return (
    <section
      className={`table3d-scene table3d-${props.variant}`}
      aria-label="Игра за круглым столом"
    >
      <div ref={host} className="table3d-canvas" />
      <div
        ref={labels}
        className="table3d-labels"
        aria-hidden={props.variant === "bunker" ? undefined : true}
      />
      <div className="table3d-vignette" />
      <div className="table3d-toolbar">
        <div className="table3d-title">
          <span className="table3d-live-dot" />
          {props.title}
          <span className="table3d-beta">3D</span>
        </div>
        <button type="button" className="table3d-classic" onClick={props.onClassic}>
          2D
        </button>
      </div>
      <aside className="table3d-keyboard" aria-label="Управление с клавиатуры">
        <span className="table3d-keyboard-state">
          {props.cursorVisible ? "ВЗГЛЯД ЗАКРЕПЛЁН" : "СВОБОДНЫЙ ВЗГЛЯД"}
        </span>
        <ul>
          {[
            ...props.shortcuts,
            { label: props.cursorVisible ? "Свободный взгляд" : "Показать курсор", keys: ["Q"] },
            { label: "К столу", keys: ["R"] },
          ].map((item) => (
            <li key={item.label} className={item.active ? "is-available" : ""}>
              <span>{item.label}</span>
              <span>
                {item.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </aside>
      {props.children}
      {failed && (
        <div className="table3d-failure" role="alert">
          <strong>Не удалось открыть 3D-комнату</strong>
          <p>Продолжите партию за обычным столом.</p>
          <button type="button" className="btn btn-primary" onClick={props.onClassic}>
            Перейти в 2D
          </button>
        </div>
      )}
    </section>
  );
}
