import { useEffect, useRef, useState } from "react";
import { LAUGH_BEATS_SECONDS, type RoomReactionEvent } from "../../../shared/platform/reactions";

const SOUND_KEY = "partyplay_reaction_sound_v1";

/** A short voiced cartoon laugh, generated locally without downloading voice assets. */
class ReactionAudio {
  private context: AudioContext | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private sender: string | null = null;

  unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
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
    const start = context.currentTime;
    const syllables = LAUGH_BEATS_SECONDS;
    syllables.forEach((offset, index) => {
      const at = start + offset;
      const length = index === syllables.length - 1 ? 0.32 : 0.21;
      const voice = context.createOscillator();
      const envelope = context.createGain();
      voice.type = "sawtooth";
      const pitch = 175 + Math.sin(index * 1.8) * 24;
      voice.frequency.setValueAtTime(pitch * 1.2, at);
      voice.frequency.exponentialRampToValueAtTime(pitch * 0.82, at + length);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.2, at + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
      voice.connect(envelope);
      const nodes: AudioNode[] = [envelope];
      // Parallel vocal resonances form an open "ah", instead of a musical beep.
      for (const [frequency, gain] of [
        [730, 0.9],
        [1090, 0.38],
        [2440, 0.16],
      ]) {
        const formant = context.createBiquadFilter();
        const output = context.createGain();
        formant.type = "bandpass";
        formant.frequency.value = frequency;
        formant.Q.value = 3.2;
        output.gain.value = gain;
        envelope.connect(formant).connect(output).connect(context.destination);
        nodes.push(formant, output);
      }
      this.voices.add(voice);
      voice.onended = () => {
        voice.disconnect();
        nodes.forEach((node) => node.disconnect());
        this.voices.delete(voice);
      };
      voice.start(at);
      voice.stop(at + length + 0.02);
    });
  }

  stop() {
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
