import type * as THREE from "three";
import type { RoomReactionId } from "../../../../../shared/platform/reactions";
import type { makeSeatedArm } from "./AvatarParts";

export const AVATAR_EXIT_DURATION_MS = 2200;
const REACTION_DURATION_MS = 2600;
const HIP_HEIGHT = 0.92;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/** Procedural poses on a small rigid-part rig; the chair stays outside the animated body. */
export class TableAvatarAnimator {
  private eliminated = false;
  private exitStartedAt: number | null = null;
  private reaction: { id: RoomReactionId; startedAt: number } | null = null;
  private lookYaw = 0;
  private lookPitch = 0.18;
  private lastFrameAt = performance.now();

  constructor(
    private readonly body: THREE.Group,
    private readonly head: THREE.Group,
    private readonly leftArm: ReturnType<typeof makeSeatedArm>,
    private readonly rightArm: ReturnType<typeof makeSeatedArm>,
    private readonly cards: THREE.Group,
    private readonly idlePhase = 0,
  ) {}

  setEliminated(eliminated: boolean, startedAt?: number, initial = false) {
    if (eliminated === this.eliminated) return;
    this.eliminated = eliminated;
    this.reaction = null;
    this.exitStartedAt = eliminated ? (startedAt ?? (initial ? null : performance.now())) : null;
  }

  react(id: RoomReactionId, time: number) {
    if (!this.eliminated) this.reaction = { id, startedAt: time };
  }

  frame(
    time: number,
    smoothing: number,
    yaw: number,
    pitch: number,
    reducedMotion: boolean,
    paused: boolean,
  ) {
    const elapsed = Math.max(0, time - this.lastFrameAt);
    this.lastFrameAt = time;
    // Host controls obscure the table while paused. Continue fresh gestures after they close.
    if (paused) {
      if (
        this.exitStartedAt !== null &&
        time - this.exitStartedAt < AVATAR_EXIT_DURATION_MS + elapsed
      )
        this.exitStartedAt += elapsed;
      if (this.reaction) this.reaction.startedAt += elapsed;
    }
    this.lookYaw += (yaw - this.lookYaw) * smoothing;
    this.lookPitch += (pitch - this.lookPitch) * smoothing;
    this.body.position.set(0, HIP_HEIGHT, 0);
    this.body.rotation.set(0, 0, 0);
    this.leftArm.resetGesture();
    this.rightArm.resetGesture();
    this.leftArm.root.rotation.set(0, 0, 0);
    this.rightArm.root.rotation.set(0, 0, 0);
    this.head.rotation.set(this.lookPitch, this.lookYaw, 0);
    this.cards.visible = !this.eliminated;

    if (this.eliminated) {
      const progress =
        reducedMotion || this.exitStartedAt === null
          ? 1
          : clamp((time - this.exitStartedAt) / AVATAR_EXIT_DURATION_MS);
      const recoil = Math.sin(clamp(progress / 0.25) * Math.PI);
      const fall = ease((progress - 0.18) / 0.65);
      const landing = ease((progress - 0.72) / 0.28);
      this.body.position.y += recoil * 0.09 + Math.sin(fall * Math.PI) * 0.58 - landing * 0.32;
      this.body.position.z = -fall * 1.15;
      this.body.rotation.x = -recoil * 0.08 - fall * 1.72;
      this.body.rotation.z = Math.sin(fall * Math.PI) * 0.12;
      this.head.rotation.set(-0.18 * fall, 0.1 * fall, 0.12 * fall);
      this.leftArm.root.rotation.set(-Math.sin(fall * Math.PI) * 1.8 - fall * 0.2, 0, fall * 0.4);
      this.rightArm.root.rotation.set(-Math.sin(fall * Math.PI) * 1.6 - fall * 0.3, 0, -fall * 0.5);
      return;
    }

    if (!this.reaction) {
      if (!reducedMotion && !paused) {
        const breath = Math.sin(time * 0.0016 + this.idlePhase);
        this.body.position.y += breath * 0.005;
        this.head.rotation.z = Math.sin(time * 0.0008 + this.idlePhase) * 0.009;
        this.rightArm.root.rotation.x = -(0.5 + breath * 0.5) * 0.012;
      }
      return;
    }
    const reactionElapsed = time - this.reaction.startedAt;
    if (reactionElapsed >= REACTION_DURATION_MS) {
      this.reaction = null;
      return;
    }
    // Reduced motion keeps the normal pose; the sticker and reaction label remain visible.
    if (reducedMotion) return;
    const t = reactionElapsed / 1000;
    const envelope =
      ease(reactionElapsed / 260) * ease((REACTION_DURATION_MS - reactionElapsed) / 420);
    // A deliberate gesture with a quiet hold and soft return, instead of shaking
    // the whole body throughout every emotion.
    const nod = Math.sin(clamp((t - 0.35) / 0.9) * Math.PI * 2);
    switch (this.reaction.id) {
      case "good-move":
        this.rightArm.gesture(0.36, 1.96, 0.62, 0.1, -0.3, -0.12, envelope);
        this.head.rotation.x += nod * 0.16 * envelope;
        break;
      case "bravo": {
        const clap = (1 - Math.cos(clamp((t - 0.3) / 1.6) * Math.PI * 8)) / 2;
        const spread = 0.065 + clap * 0.15;
        this.leftArm.gesture(-spread, 1.82, 0.72, 0, Math.PI / 2, -0.1, envelope);
        this.rightArm.gesture(spread, 1.82, 0.72, 0, -Math.PI / 2, 0.1, envelope);
        this.head.rotation.x += 0.06 * envelope;
        this.cards.visible = envelope < 0.1;
        break;
      }
      case "wow":
        this.body.rotation.x = -0.07 * envelope;
        this.head.rotation.x -= 0.14 * envelope;
        this.leftArm.gesture(-0.28, 2.05, 0.32, 0, 0.6, -0.2, envelope);
        this.rightArm.gesture(0.28, 2.05, 0.32, 0, -0.6, 0.2, envelope);
        this.cards.visible = envelope < 0.1;
        break;
      case "nice":
        this.rightArm.gesture(0.56, 1.84, 0.65, -1.1, -0.35, -0.25, envelope);
        this.head.rotation.z = -0.1 * envelope;
        this.head.rotation.x += 0.1 * envelope;
        break;
      case "lucky": {
        const wipe = ease((t - 0.55) / 0.9);
        this.rightArm.gesture(0.02 + wipe * 0.28, 2.14, 0.34, 0, -0.4, -0.7, envelope);
        this.head.rotation.x += 0.09 * envelope;
        this.body.position.y -= 0.018 * envelope;
        break;
      }
      case "fire": {
        const cheer = Math.sin(clamp((t - 0.35) / 1.5) * Math.PI * 4) * 0.07;
        this.leftArm.gesture(-0.45, 2.12 + cheer, 0.5, 0, 0.15, -0.3, envelope);
        this.rightArm.gesture(0.45, 2.12 + cheer, 0.5, 0, -0.15, 0.3, envelope);
        this.body.rotation.x = -0.035 * envelope;
        this.cards.visible = envelope < 0.1;
        break;
      }
    }
  }
}
