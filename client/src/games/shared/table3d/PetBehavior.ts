import { PET_SPECIES_INFO, type PetSpecies } from "../../../../../shared/platform/pet";

export type PetMotion =
  | "egg-rock"
  | "egg-tap"
  | "egg-roll"
  | "hop"
  | "wave"
  | "twirl"
  | "nuzzle"
  | "toddle"
  | "scamper"
  | "stroll"
  | "nap"
  | "stretch"
  | "groom"
  | "look"
  | "flutter";

interface Motion {
  kind: PetMotion;
  startedAt: number;
  duration: number;
}

const idleMotions: readonly (readonly PetMotion[])[] = [
  ["egg-rock", "egg-tap", "egg-roll"],
  ["toddle", "hop", "look", "nap"],
  ["scamper", "hop", "stretch", "flutter", "look"],
  ["nap", "stretch", "groom", "stroll"],
];

const reactions: Record<PetSpecies, readonly PetMotion[]> = {
  dragon: ["hop", "flutter", "twirl", "nuzzle"],
  cat: ["wave", "nuzzle", "twirl", "stretch"],
  fox: ["twirl", "hop", "wave", "nuzzle"],
  rabbit: ["hop", "twirl", "wave", "nuzzle"],
  owl: ["flutter", "wave", "look", "nuzzle"],
};

const idleDuration: Record<PetMotion, number> = {
  "egg-rock": 2600,
  "egg-tap": 2200,
  "egg-roll": 3000,
  hop: 2500,
  wave: 2400,
  twirl: 2800,
  nuzzle: 2600,
  toddle: 3800,
  scamper: 4800,
  stroll: 5200,
  nap: 7200,
  stretch: 4200,
  groom: 4800,
  look: 3200,
  flutter: 3200,
};

/** Local animation time stops with the scene and never catches up after a hidden tab. */
export class PetBehavior {
  time = 0;
  motion: Motion | null = null;
  reactionStartedAt = -Infinity;
  private lastFrame: number | null = null;
  private nextIdleAt = Infinity;
  private lastIdle: PetMotion | null = null;
  private lastReaction: PetMotion | null = null;
  private lastClickAt = -Infinity;
  private reactionText = "";

  constructor(
    private readonly stage: number,
    private readonly species: PetSpecies,
  ) {}

  private pick(pool: readonly PetMotion[], previous: PetMotion | null): PetMotion {
    const choices = pool.filter(
      (kind) =>
        kind !== previous &&
        (kind !== "flutter" ||
          this.species === "owl" ||
          (this.species === "dragon" && this.stage >= 2)),
    );
    return choices[Math.floor(Math.random() * choices.length)] ?? "hop";
  }

  react(time: number): string {
    if (time - this.lastClickAt < 450) return this.reactionText;
    this.lastClickAt = time;
    const kind = this.pick(
      this.stage === 0 ? idleMotions[0] : reactions[this.species],
      this.lastReaction,
    );
    this.lastReaction = kind;
    this.motion = { kind, startedAt: this.time, duration: 2200 };
    this.reactionStartedAt = this.time;
    this.reactionText =
      this.stage === 0
        ? kind === "egg-tap"
          ? "Тук-тук! Кто там снаружи?"
          : kind === "egg-roll"
            ? "Ой! Яйцо перекатилось и вернулось на место."
            : "Малыш шевелится внутри!"
        : kind === "wave"
          ? "Держите лапку! Давайте ещё поиграем."
          : kind === "hop"
            ? "Прыг-прыг! Вот как я вам рад!"
            : kind === "twirl"
              ? "Смотрите! Поворот — и снова к вам."
              : kind === "nuzzle"
                ? "Ещё немного ласки? Прижмусь поближе."
                : kind === "stretch"
                  ? "Лапки вперёд! Хорошо потянуться вместе."
                  : kind === "look"
                    ? "Ух ты! Наклоню голову, чтобы рассмотреть вас."
                    : PET_SPECIES_INFO[this.species].reaction;
    return this.reactionText;
  }

  frame(time: number, reducedMotion: boolean, paused: boolean) {
    const delta = this.lastFrame === null ? 0 : Math.max(0, Math.min(100, time - this.lastFrame));
    this.lastFrame = time;
    if (paused) return;
    this.time += delta;
    if (reducedMotion) {
      this.motion = null;
      this.nextIdleAt = Infinity;
      return;
    }
    if (this.nextIdleAt === Infinity) this.nextIdleAt = this.time + 3000 + Math.random() * 2500;
    if (this.motion && this.time >= this.motion.startedAt + this.motion.duration) {
      this.motion = null;
      this.nextIdleAt = this.time + 3500 + Math.random() * 5000;
    }
    if (!this.motion && this.time >= this.nextIdleAt) {
      const pool = idleMotions[this.stage] ?? idleMotions[3];
      // The first habit makes the stage recognizable; later actions vary at random.
      const kind = this.lastIdle === null ? pool[0] : this.pick(pool, this.lastIdle);
      this.lastIdle = kind;
      this.motion = { kind, startedAt: this.time, duration: idleDuration[kind] };
    }
  }
}
