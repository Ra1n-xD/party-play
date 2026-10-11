import { brandStorage } from "./brandStorage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROOM_REACTION_SOUNDS,
  hasRoomReactionSound,
  type RoomReactionEvent,
  type RoomReactionId,
  type RoomReactionSoundId,
} from "../../../shared/platform/reactions";
import laughUrl from "../assets/audio/laugh.wav";

const SOUND_KEY = "partyside_reaction_sound_v1";
const SOUND_PREFERENCE_EVENT = "partyside:reaction-sound-preference";

/** An original descending bass phrase, with a soft musical overtone and no samples. */
function createMogBuffer(context: AudioContext): AudioBuffer {
  const duration = 1.12;
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  const notes = [
    { at: 0, duration: 0.38, frequency: 110, level: 0.5 },
    { at: 0.22, duration: 0.36, frequency: 82.4069, level: 0.48 },
    { at: 0.43, duration: 0.65, frequency: 73.4162, level: 0.6 },
    { at: 0.46, duration: 0.58, frequency: 293.6648, level: 0.09 },
  ];
  let peak = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / context.sampleRate;
    let sample = 0;
    for (const note of notes) {
      const elapsed = time - note.at;
      if (elapsed < 0 || elapsed >= note.duration) continue;
      const attack = Math.min(1, elapsed / 0.012);
      const release = Math.min(1, (note.duration - elapsed) / 0.14);
      const envelope = attack * release * Math.exp(-3.2 * elapsed);
      const phase =
        Math.PI * 2 * note.frequency * (elapsed + 0.00315 * (1 - Math.exp(-elapsed / 0.035)));
      sample +=
        note.level *
        envelope *
        (Math.sin(phase) + 0.18 * Math.sin(phase * 2) + 0.08 * Math.sin(phase * 3));
    }
    samples[index] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  // Keep headroom before the per-emotion playback gain; the waveform starts and ends at zero.
  if (peak > 0) {
    for (let index = 0; index < samples.length; index++) samples[index] *= 0.72 / peak;
  }
  return buffer;
}

class ReactionAudio {
  private context: AudioContext | null = null;
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private sender: string | null = null;
  private buffers = new Map<RoomReactionSoundId, Promise<AudioBuffer | null>>();
  private generation = 0;

  private loadBuffer(id: RoomReactionSoundId, context: AudioContext) {
    const existing = this.buffers.get(id);
    if (existing) return existing;
    const buffer =
      id === "mog"
        ? Promise.resolve(createMogBuffer(context))
        : fetch(laughUrl)
            .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject()))
            .then((bytes) => context.decodeAudioData(bytes))
            .catch(() => {
              // A later gesture can retry a missing local asset without blocking the game.
              if (this.context === context) this.buffers.delete(id);
              return null;
            });
    this.buffers.set(id, buffer);
    return buffer;
  }

  async unlock(): Promise<AudioContext | null> {
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      // Resume in the gesture itself. iOS also needs completed touch/click events after interruption.
      const resumed = context.state === "running" ? Promise.resolve() : context.resume();
      void this.loadBuffer("laugh", context);
      await resumed;
      return this.context === context && context.state === "running" ? context : null;
    } catch {
      // An unavailable audio device must never block an emotion or the game.
      return null;
    }
  }

  private play(id: RoomReactionSoundId, at: number | null, generation: number) {
    const context = this.context;
    if (!context) return;
    const volume = ROOM_REACTION_SOUNDS[id].volume;
    void this.loadBuffer(id, context).then((buffer) => {
      if (!buffer || generation !== this.generation || context.state !== "running") return;
      // Runtime decode can finish late: skip elapsed audio to stay in sync with the gesture.
      // Explicit previews have no animation deadline, so they always start at the beginning.
      const offset = at === null ? 0 : Math.max(0, context.currentTime - at);
      if (offset >= buffer.duration) return;
      const start = Math.max(at ?? context.currentTime, context.currentTime);
      const remaining = buffer.duration - offset;
      const voice = context.createBufferSource();
      const envelope = context.createGain();
      voice.buffer = buffer;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(volume, start + Math.min(0.03, remaining / 3));
      envelope.gain.setValueAtTime(volume, start + Math.max(remaining - 0.14, remaining / 3));
      envelope.gain.linearRampToValueAtTime(0, start + remaining);
      voice.connect(envelope).connect(context.destination);
      this.voices.set(voice, envelope);
      voice.onended = () => {
        voice.disconnect();
        envelope.disconnect();
        this.voices.delete(voice);
      };
      voice.start(start, offset);
    });
  }

  receive(event: RoomReactionEvent) {
    if (this.sender === event.senderSeatId) this.stop();
    if (!hasRoomReactionSound(event.reactionId) || this.context?.state !== "running") return;
    this.stop();
    this.sender = event.senderSeatId;
    this.play(
      event.reactionId,
      this.context.currentTime + ROOM_REACTION_SOUNDS[event.reactionId].startSeconds,
      this.generation,
    );
  }

  preview(id: RoomReactionId) {
    if (!hasRoomReactionSound(id) || document.hidden) return;
    this.stop();
    const generation = this.generation;
    // Only call preview from a button gesture: it unlocks audio without changing game sound settings.
    void this.unlock().then((context) => {
      if (!context || generation !== this.generation || document.hidden) return;
      this.play(id, null, generation);
    });
  }

  stop() {
    this.generation++;
    const context = this.context;
    this.voices.forEach((envelope, voice) => {
      try {
        if (context?.state === "running") {
          const now = context.currentTime;
          if (typeof envelope.gain.cancelAndHoldAtTime === "function")
            envelope.gain.cancelAndHoldAtTime(now);
          else {
            const volume = envelope.gain.value;
            envelope.gain.cancelScheduledValues(now);
            envelope.gain.setValueAtTime(volume, now);
          }
          envelope.gain.linearRampToValueAtTime(0, now + 0.025);
          voice.stop(now + 0.025);
        } else voice.stop();
      } catch {
        /* A completed voice may await onended. */
      }
    });
    this.sender = null;
  }

  dispose() {
    this.stop();
    this.voices.forEach((envelope, voice) => {
      voice.disconnect();
      envelope.disconnect();
    });
    this.voices.clear();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.buffers.clear();
  }
}

function soundEnabled() {
  try {
    return brandStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function eventSoundEnabled(event: Event) {
  return event instanceof CustomEvent && typeof event.detail === "boolean"
    ? event.detail
    : soundEnabled();
}

export function useReactionAudio(events: readonly RoomReactionEvent[], paused = false) {
  const [enabled, setEnabled] = useState(true);
  const audio = useRef<ReactionAudio>();
  const seen = useRef(new Set(events.map((event) => event.eventId)));
  useEffect(() => setEnabled(soundEnabled()), []);
  useEffect(() => {
    const unlock = (event: Event) => {
      if (!enabled || paused || !event.isTrusted) return;
      audio.current ??= new ReactionAudio();
      void audio.current.unlock();
    };
    const hide = () => {
      if (document.hidden) audio.current?.stop();
    };
    const preferenceChanged = (event: Event) => {
      const next = eventSoundEnabled(event);
      if (!next) audio.current?.stop();
      setEnabled(next);
    };
    const storageChanged = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === SOUND_KEY ||
        event.key === "partyplay_reaction_sound_v1"
      )
        preferenceChanged(event);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchend", unlock, { passive: true });
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener(SOUND_PREFERENCE_EVENT, preferenceChanged);
    window.addEventListener("storage", storageChanged);
    document.addEventListener("visibilitychange", hide);
    if (!enabled || paused) audio.current?.stop();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend", unlock);
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener(SOUND_PREFERENCE_EVENT, preferenceChanged);
      window.removeEventListener("storage", storageChanged);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [enabled, paused]);
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
        void audio.current.unlock();
      }
      setEnabled(next);
      try {
        brandStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        /* Keep the tab preference. */
      }
      window.dispatchEvent(new CustomEvent(SOUND_PREFERENCE_EVENT, { detail: next }));
    },
  };
}

/** Explicit previews ignore the game mute preference without changing it. */
export function useReactionAudioPreview() {
  const audio = useRef<ReactionAudio>();
  const stop = useCallback(() => audio.current?.stop(), []);
  const play = useCallback((reactionId: RoomReactionId) => {
    if (!hasRoomReactionSound(reactionId) || document.hidden) return;
    audio.current ??= new ReactionAudio();
    audio.current.preview(reactionId);
  }, []);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    const preferenceChanged = (event: Event) => {
      if (!eventSoundEnabled(event)) stop();
    };
    const storageChanged = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === SOUND_KEY ||
        event.key === "partyplay_reaction_sound_v1"
      )
        preferenceChanged(event);
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener(SOUND_PREFERENCE_EVENT, preferenceChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener(SOUND_PREFERENCE_EVENT, preferenceChanged);
      window.removeEventListener("storage", storageChanged);
      audio.current?.dispose();
    };
  }, [stop]);
  return { play, stop };
}
