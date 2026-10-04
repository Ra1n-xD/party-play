import { useEffect, useRef, useState } from "react";
import {
  LAUGH_AUDIO_START_SECONDS,
  type RoomReactionEvent,
} from "../../../shared/platform/reactions";
import laughUrl from "../assets/audio/laugh.wav";

const SOUND_KEY = "partyplay_reaction_sound_v1";

/** A local recording of a natural chuckle, timed to the standing animation. */
class ReactionAudio {
  private context: AudioContext | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private sender: string | null = null;
  private buffer: Promise<AudioBuffer | null> | null = null;
  private generation = 0;

  unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
      const context = this.context;
      this.buffer ??= fetch(laughUrl)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject()))
        .then((bytes) => context.decodeAudioData(bytes))
        .catch(() => null);
    } catch {
      // An unavailable audio device must never block an emotion or the game.
    }
  }

  receive(event: RoomReactionEvent) {
    if (this.sender === event.senderSeatId) this.stop();
    if (event.reactionId !== "laugh" || this.context?.state !== "running") return;
    this.stop();
    this.sender = event.senderSeatId;
    const context = this.context;
    const at = context.currentTime + LAUGH_AUDIO_START_SECONDS;
    const generation = this.generation;
    void this.buffer?.then((buffer) => {
      if (!buffer || generation !== this.generation || context.state !== "running") return;
      // Decoding on the first gesture may finish late: keep audio and animation in sync.
      const offset = Math.max(0, context.currentTime - at);
      if (offset >= buffer.duration) return;
      const start = Math.max(at, context.currentTime);
      const remaining = buffer.duration - offset;
      const voice = context.createBufferSource();
      const envelope = context.createGain();
      voice.buffer = buffer;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.65, start + Math.min(0.03, remaining / 3));
      envelope.gain.setValueAtTime(0.65, start + Math.max(remaining - 0.14, remaining / 3));
      envelope.gain.linearRampToValueAtTime(0, start + remaining);
      voice.connect(envelope).connect(context.destination);
      this.voices.add(voice);
      voice.onended = () => {
        voice.disconnect();
        envelope.disconnect();
        this.voices.delete(voice);
      };
      voice.start(start, offset);
    });
  }

  stop() {
    this.generation++;
    this.voices.forEach((voice) => {
      try {
        voice.stop();
      } catch {
        /* A completed voice may await onended. */
      }
    });
    this.voices.clear();
    this.sender = null;
  }

  dispose() {
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.buffer = null;
  }
}

export function useReactionAudio(events: readonly RoomReactionEvent[], paused = false) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const audio = useRef<ReactionAudio>();
  const seen = useRef(new Set(events.map((event) => event.eventId)));
  useEffect(() => {
    const unlock = () => {
      if (!enabled) return;
      audio.current ??= new ReactionAudio();
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
    if (paused || events.length === 0) audio.current?.stop();
    for (const event of events) {
      if (seen.current.has(event.eventId)) continue;
      seen.current.add(event.eventId);
      if (seen.current.size > 64) seen.current.delete(seen.current.values().next().value!);
      if (enabled && !paused && !document.hidden) audio.current?.receive(event);
    }
  }, [events, enabled, paused]);
  useEffect(() => () => audio.current?.dispose(), []);
  return {
    enabled,
    toggle() {
      const next = !enabled;
      if (!next) audio.current?.stop();
      else {
        audio.current ??= new ReactionAudio();
        audio.current.unlock();
      }
      setEnabled(next);
      try {
        localStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        /* Keep the tab preference. */
      }
    },
  };
}
