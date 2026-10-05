import { brandStorage } from "../../platform/brandStorage";
import { useEffect, useRef, useState } from "react";
import type { CardTransferVisualEvent, PlayerActionVisualEvent } from "../../../../shared/types";

const SOUND_KEY = "partyside_card_game_sound_v1";
type VisualEvent = CardTransferVisualEvent | PlayerActionVisualEvent;

class CardGameAudio {
  private context: AudioContext | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private noise: AudioBuffer | null = null;
  unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    } catch {
      // Optional audio never blocks a game command.
    }
  }
  private track(source: AudioScheduledSourceNode, gain: GainNode) {
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }
  turn() {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;
    [660, 880].forEach((frequency, index) => {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.13;
      tone.type = "sine";
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.055, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      tone.connect(gain).connect(ctx.destination);
      this.track(tone, gain);
      tone.start(start);
      tone.stop(start + 0.27);
    });
  }
  card() {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.16), ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1700, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.14);
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    source.connect(filter).connect(gain).connect(ctx.destination);
    this.track(source, gain);
    source.addEventListener("ended", () => filter.disconnect());
    source.start();
    source.stop(ctx.currentTime + 0.16);
  }
  stop() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* Already stopped. */
      }
    }
    this.voices.clear();
  }
  dispose() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
  }
}

export function useCardGameAudio(
  events: readonly VisualEvent[],
  yourTurn: boolean,
  paused: boolean,
) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return brandStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [turnNotice, setTurnNotice] = useState(false);
  const audio = useRef<CardGameAudio>();
  const seen = useRef<Set<number> | null>(null);
  const previousTurn = useRef(false);
  useEffect(() => {
    const unlock = () => {
      if (!enabled) return;
      audio.current ??= new CardGameAudio();
      audio.current.unlock();
    };
    const hide = () => {
      if (document.hidden) audio.current?.stop();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", hide);
    if (!enabled) audio.current?.stop();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [enabled]);
  useEffect(() => {
    const fresh = seen.current ? events.filter((event) => !seen.current!.has(event.id)) : [];
    seen.current = new Set(events.map((event) => event.id));
    if (paused) audio.current?.stop();
    if (
      enabled &&
      !paused &&
      !document.hidden &&
      fresh.some(
        (event) =>
          event.type === "transfer" &&
          event.source.kind === "player" &&
          (event.target.kind === "table" || event.target.kind === "discard"),
      )
    )
      audio.current?.card();
  }, [events, enabled, paused]);
  useEffect(() => {
    const started = yourTurn && !previousTurn.current;
    previousTurn.current = yourTurn;
    if (!yourTurn) setTurnNotice(false);
    if (!started || paused || document.hidden) return;
    setTurnNotice(true);
    if (enabled) audio.current?.turn();
  }, [yourTurn, paused, enabled]);
  useEffect(() => {
    if (!turnNotice) return;
    const timer = window.setTimeout(() => setTurnNotice(false), 3_000);
    return () => window.clearTimeout(timer);
  }, [turnNotice]);
  useEffect(() => () => audio.current?.dispose(), []);
  return {
    enabled,
    turnNotice,
    toggle() {
      const next = !enabled;
      if (next) {
        audio.current ??= new CardGameAudio();
        audio.current.unlock();
      } else audio.current?.stop();
      setEnabled(next);
      try {
        brandStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        /* Tab preference. */
      }
    },
  };
}
