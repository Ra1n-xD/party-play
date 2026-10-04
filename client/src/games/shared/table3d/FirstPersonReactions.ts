import * as THREE from "three";
import {
  getRoomReactionDuration,
  type RoomReactionId,
} from "../../../../../shared/platform/reactions";
import type { makeArticulatedHand } from "./AvatarHand";

export interface FirstPersonGrip {
  root: THREE.Group;
  side: number;
  hand: ReturnType<typeof makeArticulatedHand>;
  sleeve: THREE.Mesh;
  restPosition: THREE.Vector3;
  restRotation: THREE.Quaternion;
}

const FIST = [0.96, 1, 1, 0.96];
const POINT = [0.08, 0.86, 0.94, 1];
const OPEN = [0.08, 0.12, 0.16, 0.22];
const CUPPED = [0.2, 0.26, 0.3, 0.36];
const ease = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const pulse = (t: number, start: number, duration: number) =>
  Math.sin(THREE.MathUtils.clamp((t - start) / duration, 0, 1) * Math.PI) ** 2;

/** Camera-local gestures share the avatar's timing and articulated finger anatomy.
 * The card fan stays put so sending a reaction never moves a gameplay hit target. */
export class FirstPersonReactions {
  private reaction: { id: RoomReactionId; startedAt: number } | null = null;
  private queued: RoomReactionId | null = null;
  private releaseAt: number | null = null;
  private lastFrameAt = performance.now();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();

  reset() {
    this.reaction = null;
    this.queued = null;
    this.releaseAt = null;
  }

  react(id: RoomReactionId, time: number) {
    if (
      this.reaction &&
      time - this.reaction.startedAt < getRoomReactionDuration(this.reaction.id)
    ) {
      this.queued = id;
      this.releaseAt ??= time;
    } else {
      this.reaction = { id, startedAt: time };
      this.queued = null;
      this.releaseAt = null;
    }
  }

  frame(
    time: number,
    paused: boolean,
    hidden: boolean,
    grips: readonly FirstPersonGrip[],
    scale: number,
  ) {
    const elapsed = Math.max(0, time - this.lastFrameAt);
    this.lastFrameAt = time;
    if (paused) {
      if (this.reaction) this.reaction.startedAt += elapsed;
      if (this.releaseAt !== null) this.releaseAt += elapsed;
    }
    const releaseDuration = this.reaction?.id === "laugh" ? 450 : 180;
    const expired =
      this.reaction && time - this.reaction.startedAt >= getRoomReactionDuration(this.reaction.id);
    if (
      this.queued &&
      this.releaseAt !== null &&
      (expired || time - this.releaseAt >= releaseDuration)
    ) {
      this.reaction = { id: this.queued, startedAt: time };
      this.queued = null;
      this.releaseAt = null;
    } else if (expired) this.reset();
    for (const grip of grips) {
      grip.root.position.copy(grip.restPosition);
      grip.root.quaternion.copy(grip.restRotation);
      grip.hand.reset();
    }
    if (!this.reaction || hidden) return false;
    const { id, startedAt } = this.reaction;
    const t = Math.max(0, time - startedAt) / 1000;
    const seconds = getRoomReactionDuration(id) / 1000;
    const release =
      this.releaseAt === null ? 1 : 1 - ease((time - this.releaseAt) / releaseDuration);
    const weight = ease((t - 0.12) / 0.5) * ease((seconds - t) / 0.65) * release;
    const fingers = ease((t - 0.04) / 0.38) * ease((seconds - t) / 0.5) * release;
    for (const grip of grips) {
      const side = grip.side;
      const right = side > 0;
      let x = side * 0.3;
      let y = -0.06;
      let z = -1.12;
      let rx = 0;
      let ry = -side * 0.25;
      let rz = side * 0.12;
      let curls = OPEN;
      let spread = 0.1;
      let thumb = 0.35;
      let approval = 0;
      let lift = weight;
      switch (id) {
        case "good-move":
          if (!right) continue;
          x = 0.25;
          y = -0.03 + pulse(t, 0.65, 0.5) * 0.015;
          ry = -0.55;
          rz = -0.9;
          curls = FIST;
          thumb = 0.82;
          approval = ease((t - 0.43) / 0.36) * ease((seconds - t) / 0.5);
          lift = ease((t - 0.18) / 0.63) * ease((seconds - t) / 0.7) * release;
          break;
        case "bravo": {
          const cycle = (Math.max(0, t - 0.62) % 0.48) / 0.48;
          const close =
            cycle < 0.34 ? ease(cycle / 0.34) : cycle < 0.43 ? 1 : 1 - ease((cycle - 0.43) / 0.57);
          const contact = t >= 0.62 && t < 2.06 ? close : 0;
          x = side * (0.14 - contact * 0.11);
          y = -0.06 + (right ? 0.01 : 0);
          ry = (-side * Math.PI) / 2;
          rz = side * 0.1;
          curls = CUPPED;
          break;
        }
        case "wow":
          x = side * 0.28;
          y = 0.04 - ease((t - 1.1) / 0.7) * 0.02;
          ry = -side * 0.65;
          spread = 0.8;
          thumb = 0.06;
          break;
        case "nice":
          if (!right) continue;
          x = 0.22;
          rx = -0.35;
          ry = -0.5;
          rz = -0.2;
          curls = POINT;
          break;
        case "lucky":
          if (!right) continue;
          x = 0.16 + ease((t - 0.82) / 0.8) * 0.2;
          y = 0.15;
          ry = -0.45;
          rz = -0.9;
          curls = CUPPED;
          break;
        case "fire":
          y =
            0.04 +
            pulse(t, right ? 0.67 : 0.58, 0.75) * 0.09 +
            pulse(t, right ? 1.51 : 1.42, 0.65) * 0.06;
          curls = FIST;
          thumb = 0.92;
          break;
        case "laugh": {
          const jump = pulse(t, 0.7, 0.46) + pulse(t, 1.34, 0.46) + pulse(t, 1.98, 0.46);
          x = side * (0.31 + jump * 0.015);
          y = 0.13 + jump * 0.11;
          rz = side * (0.18 + jump * 0.08);
          curls = FIST;
          thumb = 0.85;
          break;
        }
        case "mog": {
          if (!right) continue;
          const jaw = ease((t - 0.9) / 0.65);
          x = 0.025 + jaw * 0.26;
          y = -0.1 - jaw * 0.04;
          z = -0.85;
          ry = -0.4;
          rz = -jaw * 0.95;
          curls = POINT;
          thumb = 0.65;
          break;
        }
      }
      this.position.set(x * scale, y * scale, z);
      this.rotation.setFromEuler(this.euler.set(rx, ry, rz));
      grip.root.position.lerp(this.position, lift);
      grip.root.quaternion.slerp(this.rotation, lift);
      grip.hand.pose(curls, spread, thumb, fingers, approval);
    }
    return weight > 0.001;
  }
}
