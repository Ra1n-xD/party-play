import { brandStorage } from "./brandStorage";
import { useEffect, useRef, useState } from "react";

const SOUND_KEY = "partyside_case_sound_v1";

class CollectionAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private voices = new Set<OscillatorNode>();

  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        // A quiet master level also limits overlapping notes in the reveal chord.
        this.output.gain.value = 0.12;
        this.output.connect(this.context.destination);
      }
      void this.context.resume().catch(() => {});
    } catch {
      // Audio is optional; unavailable devices must not block collection actions.
    }
  }

  private tone(frequency: number, at: number, length: number, volume: number) {
    if (!this.context || !this.output) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, at + length);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + length);
    oscillator.connect(envelope);
    envelope.connect(this.output);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.voices.delete(oscillator);
    };
    oscillator.start(at);
    oscillator.stop(at + length + 0.01);
  }

  spin(duration: number) {
    this.stop();
    if (!this.context || duration < 0.5) return;
    const start = this.context.currentTime + 0.02;
    // Increasing intervals follow the reel slowing down near the winning card.
    for (let i = 0; i < 32; i++) {
      const position = i / 32;
      const at = start + duration * (0.3 * position + 0.7 * position ** 3);
      this.tone(650 + (i % 3) * 55, at, 0.035, 0.24);
    }
  }

  reveal(success = true) {
    this.stop();
    if (!this.context || !this.output) return;
    const start = this.context.currentTime;
    // A short, soft bell flourish. Stable pitches replace the old sliding tones;
    // the reel ticks above keep their original sound and timing.
    const notes = success ? [587.33, 880, 1174.66] : [349.23, 293.66];
    notes.forEach((frequency, index) => {
      const at = start + index * (success ? 0.085 : 0.13);
      const length = success ? 0.6 : 0.34;
      [1, 2, 3].forEach((harmonic, partial) => {
        const oscillator = this.context!.createOscillator();
        const envelope = this.context!.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency * harmonic, at);
        const volume = (success ? 0.17 : 0.14) / (harmonic * harmonic);
        const decay = length / (1 + partial * 0.6);
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(volume, at + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        oscillator.connect(envelope);
        envelope.connect(this.output!);
        this.voices.add(oscillator);
        oscillator.onended = () => {
          oscillator.disconnect();
          envelope.disconnect();
          this.voices.delete(oscillator);
        };
        oscillator.start(at);
        oscillator.stop(at + decay + 0.02);
      });
    });
  }

  stop() {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
  }

  dispose() {
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.output = null;
  }
}

export function useCollectionAudio() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return brandStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const enabledRef = useRef(enabled);
  const audio = useRef<CollectionAudio>();
  useEffect(() => () => audio.current?.dispose(), []);
  return {
    enabled,
    toggle() {
      const next = !enabledRef.current;
      enabledRef.current = next;
      setEnabled(next);
      if (!next) audio.current?.stop();
      try {
        brandStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        /* The current tab still remembers the setting. */
      }
    },
    unlock() {
      if (!enabledRef.current) return;
      audio.current ??= new CollectionAudio();
      audio.current.unlock();
    },
    spin(duration: number) {
      if (enabledRef.current) audio.current?.spin(duration);
    },
    reveal(success = true) {
      if (enabledRef.current) audio.current?.reveal(success);
    },
  };
}
