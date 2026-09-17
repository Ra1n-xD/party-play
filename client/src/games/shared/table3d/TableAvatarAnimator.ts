import type * as THREE from "three";
import type { RoomReactionId } from "../../../../../shared/platform/reactions";

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
    private readonly leftArm: THREE.Group,
    private readonly rightArm: THREE.Group,
    private readonly cards: THREE.Group,
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
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);
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
      this.body.rotation.x = recoil * 0.14 - fall * 1.72;
      this.body.rotation.z = Math.sin(fall * Math.PI) * 0.12;
      this.head.rotation.set(-0.18 * fall, 0.1 * fall, 0.12 * fall);
      this.leftArm.rotation.set(-Math.sin(fall * Math.PI) * 1.8 - fall * 0.2, 0, fall * 0.4);
      this.rightArm.rotation.set(-Math.sin(fall * Math.PI) * 1.6 - fall * 0.3, 0, -fall * 0.5);
      return;
    }

    if (!this.reaction) return;
    const reactionElapsed = time - this.reaction.startedAt;
    if (reactionElapsed >= REACTION_DURATION_MS) {
      this.reaction = null;
      return;
    }
    // Reduced motion keeps the normal pose; the existing text/emoji reaction still appears.
    if (reducedMotion) return;
    const t = reactionElapsed / 1000;
    const envelope =
      ease(reactionElapsed / 260) * ease((REACTION_DURATION_MS - reactionElapsed) / 420);
    const pulse = Math.sin(t * 12);
    switch (this.reaction.id) {
      case "good-move":
        this.rightArm.rotation.set(-1.1 * envelope, -0.12 * envelope, -0.1 * envelope);
        this.head.rotation.x += Math.sin(t * 9) * 0.19 * envelope;
        break;
      case "bravo": {
        const clap = (0.5 + pulse * 0.16) * envelope;
        this.leftArm.rotation.set(-0.9 * envelope, clap, 0);
        this.rightArm.rotation.set(-0.9 * envelope, -clap, 0);
        this.body.position.y += Math.abs(pulse) * 0.025 * envelope;
        break;
      }
      case "wow":
        this.body.rotation.x = -0.14 * envelope;
        this.head.rotation.x -= 0.2 * envelope;
        this.leftArm.rotation.set(-1.35 * envelope, 0.55 * envelope, 0);
        this.rightArm.rotation.set(-1.35 * envelope, -0.55 * envelope, 0);
        break;
      case "nice":
        this.body.rotation.x = 0.1 * envelope;
        this.body.position.y += Math.abs(pulse) * 0.065 * envelope;
        this.body.rotation.z = Math.sin(t * 6) * 0.055 * envelope;
        this.head.rotation.x += (0.12 + pulse * 0.1) * envelope;
        break;
      case "lucky":
        this.rightArm.rotation.set(
          -1.65 * envelope,
          (-0.45 + Math.sin(t * 4) * 0.12) * envelope,
          0,
        );
        this.head.rotation.z = -0.14 * envelope;
        this.body.rotation.x = -0.06 * envelope;
        break;
      case "fire":
        this.leftArm.rotation.set(-2.05 * envelope, 0, 0.3 * envelope);
        this.rightArm.rotation.set(-2.05 * envelope, 0, -0.3 * envelope);
        this.body.position.y += Math.abs(Math.sin(t * 7)) * 0.1 * envelope;
        this.body.rotation.z = Math.sin(t * 7) * 0.07 * envelope;
        break;
    }
  }
}
