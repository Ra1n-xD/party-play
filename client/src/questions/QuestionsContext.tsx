import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  QuestionsAnswerField,
  QuestionsEditorRole,
  QuestionsEditorState,
  QuestionsObserverState,
  QuestionsRole,
} from "../../../shared/types";
import { questionsSocket } from "./questionsSocket";
import { QuestionsUpdateQueue, type QuestionsSaveStatus } from "./QuestionsUpdateQueue";

const SESSION_KEY = "partyplay:questions-editor-role";

export function readQuestionsEditorRole(): QuestionsEditorRole | null {
  try {
    const role = window.sessionStorage.getItem(SESSION_KEY);
    return role === "daniil" || role === "shasha" ? role : null;
  } catch {
    return null;
  }
}

function saveQuestionsEditorRole(role: QuestionsEditorRole | null): void {
  try {
    if (role) window.sessionStorage.setItem(SESSION_KEY, role);
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Role selection still works for this tab when browser storage is unavailable.
  }
}

interface QuestionsContextValue {
  role: QuestionsRole | null;
  connected: boolean;
  editorState: QuestionsEditorState | null;
  observerState: QuestionsObserverState | null;
  error: string | null;
  saveStatuses: Record<string, QuestionsSaveStatus>;
  selectRole: (role: QuestionsRole) => void;
  exitRole: () => void;
  addQuestion: () => void;
  deleteLatestQuestion: () => void;
  updateAnswer: (questionId: number, field: QuestionsAnswerField, value: string) => void;
  flushAnswer: (questionId: number, field: QuestionsAnswerField) => void;
}

const QuestionsContext = createContext<QuestionsContextValue | null>(null);

export function QuestionsProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<QuestionsRole | null>(() => readQuestionsEditorRole());
  const [connected, setConnected] = useState(false);
  const [editorState, setEditorState] = useState<QuestionsEditorState | null>(null);
  const [observerState, setObserverState] = useState<QuestionsObserverState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatuses, setSaveStatuses] = useState<Record<string, QuestionsSaveStatus>>({});
  const roleRef = useRef<QuestionsRole | null>(role);
  const updateQueue = useRef<QuestionsUpdateQueue | null>(null);
  if (!updateQueue.current) {
    updateQueue.current = new QuestionsUpdateQueue({
      send: (update) => questionsSocket.emit("questions:updateAnswer", update),
      onStatus: (key, status) => setSaveStatuses((current) => ({ ...current, [key]: status })),
    });
  }

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setError(null);
      const currentRole = roleRef.current;
      if (!currentRole) return;
      questionsSocket.emit("questions:selectRole", { role: currentRole });
      updateQueue.current?.reconnect();
    };
    const onDisconnect = () => {
      setConnected(false);
      updateQueue.current?.disconnect();
    };
    const onEditorState = (state: QuestionsEditorState) => {
      updateQueue.current?.acknowledge(state);
      setEditorState(state);
      setObserverState(null);
      setError(null);
    };
    const onObserverState = (state: QuestionsObserverState) => {
      setObserverState(state);
      setEditorState(null);
      setError(null);
    };
    const onError = (data: { message: string }) => setError(data.message);

    questionsSocket.on("connect", onConnect);
    questionsSocket.on("disconnect", onDisconnect);
    questionsSocket.on("questions:editorState", onEditorState);
    questionsSocket.on("questions:observerState", onObserverState);
    questionsSocket.on("questions:error", onError);
    if (!questionsSocket.connected) questionsSocket.connect();
    else onConnect();

    return () => {
      questionsSocket.off("connect", onConnect);
      questionsSocket.off("disconnect", onDisconnect);
      questionsSocket.off("questions:editorState", onEditorState);
      questionsSocket.off("questions:observerState", onObserverState);
      questionsSocket.off("questions:error", onError);
      updateQueue.current?.clear();
      questionsSocket.disconnect();
    };
  }, []);

  const selectRole = useCallback((nextRole: QuestionsRole) => {
    roleRef.current = nextRole;
    setRole(nextRole);
    setEditorState(null);
    setObserverState(null);
    setError(null);
    updateQueue.current?.clear();
    setSaveStatuses({});
    saveQuestionsEditorRole(nextRole === "observer" ? null : nextRole);
    if (questionsSocket.connected) {
      questionsSocket.emit("questions:selectRole", { role: nextRole });
    }
  }, []);

  const exitRole = useCallback(() => {
    roleRef.current = null;
    setRole(null);
    setEditorState(null);
    setObserverState(null);
    setError(null);
    updateQueue.current?.clear();
    setSaveStatuses({});
    saveQuestionsEditorRole(null);
  }, []);

  const addQuestion = useCallback(() => {
    if (questionsSocket.connected) questionsSocket.emit("questions:addQuestion");
  }, []);

  const deleteLatestQuestion = useCallback(() => {
    if (questionsSocket.connected) questionsSocket.emit("questions:deleteLatestQuestion");
  }, []);

  const updateAnswer = useCallback(
    (questionId: number, field: QuestionsAnswerField, value: string) => {
      const update = { questionId, field, value };
      updateQueue.current?.enqueue(update, questionsSocket.connected);
    },
    [],
  );

  const flushAnswer = useCallback((questionId: number, field: QuestionsAnswerField) => {
    updateQueue.current?.flush(questionId, field, questionsSocket.connected);
  }, []);

  const value = useMemo<QuestionsContextValue>(
    () => ({
      role,
      connected,
      editorState,
      observerState,
      error,
      saveStatuses,
      selectRole,
      exitRole,
      addQuestion,
      deleteLatestQuestion,
      updateAnswer,
      flushAnswer,
    }),
    [
      role,
      connected,
      editorState,
      observerState,
      error,
      saveStatuses,
      selectRole,
      exitRole,
      addQuestion,
      deleteLatestQuestion,
      updateAnswer,
      flushAnswer,
    ],
  );

  return <QuestionsContext.Provider value={value}>{children}</QuestionsContext.Provider>;
}

export function useQuestions(): QuestionsContextValue {
  const context = useContext(QuestionsContext);
  if (!context) throw new Error("useQuestions must be used inside QuestionsProvider");
  return context;
}
