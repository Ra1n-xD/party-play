import type * as THREE from "three";
import {
  getRoomReactionDuration,
  LAUGH_BEATS_SECONDS,
  type RoomReactionId,
} from "../../../../../shared/platform/reactions";
import type { AvatarFaceRig } from "./AvatarFace";
import type { makeSeatedArm } from "./AvatarParts";
import { AVATAR_STAND_RISE, AVATAR_STAND_FORWARD, type AvatarLegRig } from "./AvatarLegs";

export const AVATAR_EXIT_DURATION_MS = 2200;
const HIP_HEIGHT = 0.92;
const OPEN = [0.08, 0.12, 0.16, 0.22];
const CUPPED = [0.2, 0.26, 0.3, 0.36];
const FIST = [0.96, 1, 1, 0.96];
const POINT = [0.08, 0.86, 0.94, 1];
const RELAXED = [0.23, 0.32, 0.38, 0.46];
const APPROVAL_ARM = { arc: 0.05, elbowTuck: 0.9, wristAlignment: 0.25 };
const RELIEF_ARM = { arc: 0.04, elbowTuck: 0.3, wristAlignment: 0.85 };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  // Zero velocity and acceleration at both ends of each gesture.
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const pulse = (time: number, start: number, duration: number) =>
  Math.sin(clamp((time - start) / duration) * Math.PI) ** 2;

/** Face and fingers lead each gesture; the wrist, elbow and torso follow and settle. */
export class TableAvatarAnimator {
  private eliminated = false;
  private poseDirty = true;
  private exitStartedAt: number | null = null;
  private reaction: { id: RoomReactionId; startedAt: number } | null = null;
  private queuedReaction: RoomReactionId | null = null;
  private releaseStartedAt: number | null = null;
  private lookYaw = 0;
  private lookPitch = 0.18;
  private lastFrameAt = performance.now();
  private idleTime = 0;
  private readonly expression = {
    smile: 0,
    open: 0,
    brow: 0,
    squint: 0,
    blink: 0,
    gazeX: 0,
    gazeY: 0,
  };

  constructor(
    private readonly body: THREE.Group,
    private readonly head: THREE.Group,
    private readonly leftArm: ReturnType<typeof makeSeatedArm>,
    private readonly rightArm: ReturnType<typeof makeSeatedArm>,
    private readonly cards: THREE.Group,
    private readonly idlePhase = 0,
    private readonly face?: AvatarFaceRig,
    private readonly legs?: AvatarLegRig,
  ) {}

  get heightOffset() {
    return Math.max(0, this.body.position.y - HIP_HEIGHT);
  }

  setEliminated(eliminated: boolean, startedAt?: number, initial = false) {
    if (eliminated === this.eliminated) return;
    this.eliminated = eliminated;
    this.poseDirty = true;
    this.reaction = null;
    this.queuedReaction = null;
    this.releaseStartedAt = null;
    this.exitStartedAt = eliminated ? (startedAt ?? (initial ? null : performance.now())) : null;
  }

  react(id: RoomReactionId, time: number) {
    if (this.eliminated) return;
    if (
      this.reaction &&
      time - this.reaction.startedAt < getRoomReactionDuration(this.reaction.id)
    ) {
      this.queuedReaction = id;
      this.releaseStartedAt ??= time;
    } else {
      this.reaction = { id, startedAt: time };
      this.queuedReaction = null;
      this.releaseStartedAt = null;
    }
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
    if (paused) {
      if (this.exitStartedAt !== null) this.exitStartedAt += elapsed;
      if (this.reaction) this.reaction.startedAt += elapsed;
      if (this.releaseStartedAt !== null) this.releaseStartedAt += elapsed;
      // Keep the exact pose, including eyelids and finger joints, during room pause.
      if (!reducedMotion && !this.poseDirty) return;
    } else {
      this.idleTime += Math.min(elapsed, 80);
    }
    this.poseDirty = false;
    this.lookYaw += (yaw - this.lookYaw) * smoothing;
    this.lookPitch += (pitch - this.lookPitch) * smoothing;
    this.body.position.set(0, HIP_HEIGHT, 0);
    this.body.rotation.set(0, 0, 0);
    this.legs?.pose(0);
    this.leftArm.resetGesture();
    this.rightArm.resetGesture();
    this.leftArm.root.rotation.set(0, 0, 0);
    this.rightArm.root.rotation.set(0, 0, 0);
    this.head.rotation.set(this.lookPitch, this.lookYaw, 0);
    this.cards.visible = !this.eliminated;

    const face = this.expression;
    face.smile = 0.08;
    face.open = face.brow = face.squint = face.blink = 0;
    face.gazeX = clamp(0.5 + this.lookYaw * 0.45) * 2 - 1;
    face.gazeY = -this.lookPitch * 0.3;
    if (!reducedMotion) {
      const clock = this.idleTime / 1000 + this.idlePhase;
      const blinkTime = clock % 5.3;
      face.blink = pulse(blinkTime, 4.66, 0.23) + pulse(blinkTime, 5.02, 0.19) * 0.65;
      face.gazeX += Math.sin(clock * 0.67) * 0.06;
      face.gazeY += Math.sin(clock * 0.43) * 0.025;
    }

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
      face.smile = 0;
      face.blink = 0;
      face.squint = 0.5 * landing;
      face.brow = 0.7 * recoil;
      face.open = 0.45 * recoil;
      if (!reducedMotion) {
        this.leftArm.poseFingers(OPEN, 0.8, 0.1, recoil);
        this.rightArm.poseFingers(OPEN, 0.8, 0.1, recoil);
      }
      this.face?.pose(face);
      return;
    }

    if (!reducedMotion && !paused) {
      const breath = Math.sin(this.idleTime * 0.0016 + this.idlePhase);
      this.body.position.y += breath * 0.004;
      this.body.rotation.x = breath * 0.003;
      this.head.rotation.z = Math.sin(this.idleTime * 0.0008 + this.idlePhase) * 0.008;
      this.rightArm.poseFingers(RELAXED, 0.08, 0.25, 0.1 + (breath + 1) * 0.035);
    }
    const releaseDuration = this.reaction?.id === "laugh" ? 450 : 180;
    const duration = this.reaction ? getRoomReactionDuration(this.reaction.id) : 3000;
    if (
      this.queuedReaction &&
      this.releaseStartedAt !== null &&
      (time - this.releaseStartedAt >= releaseDuration ||
        (this.reaction && time - this.reaction.startedAt >= duration))
    ) {
      this.reaction = { id: this.queuedReaction, startedAt: time };
      this.queuedReaction = null;
      this.releaseStartedAt = null;
    } else if (this.reaction && time - this.reaction.startedAt >= duration) {
      this.reaction = null;
    }
    if (!this.reaction || reducedMotion) {
      this.face?.pose(face);
      return;
    }

    const t = Math.max(0, time - this.reaction.startedAt) / 1000;
    const release =
      this.releaseStartedAt === null
        ? 1
        : 1 - ease((time - this.releaseStartedAt) / releaseDuration);
    const seconds = getRoomReactionDuration(this.reaction.id) / 1000;
    const returnWeight = ease((seconds - t) / 0.65) * release;
    const gesture = ease((t - 0.12) / 0.5) * returnWeight;
    const fingers = ease((t - 0.04) / 0.38) * returnWeight;
    const expression = ease(t / 0.3) * ease((seconds - t) / 0.5) * release;
    const anticipation = pulse(t, 0, 0.48) * release;
    this.body.rotation.x += anticipation * 0.014;
    switch (this.reaction.id) {
      case "mog": {
        const jaw = ease((t - 0.9) / 0.65);
        this.rightArm.gesture(
          0.015 + jaw * 0.23,
          2.13 - jaw * 0.06,
          0.35 - jaw * 0.06,
          0,
          -0.3,
          -jaw * 0.85,
          gesture,
          RELIEF_ARM,
        );
        this.rightArm.poseFingers(POINT, 0.06, 0.65, fingers);
        this.head.rotation.x -= 0.17 * jaw * gesture;
        this.head.rotation.y += 0.22 * jaw * gesture;
        this.head.rotation.z -= 0.035 * gesture;
        this.body.rotation.x -= 0.025 * gesture;
        face.smile = 0.12 * expression;
        face.squint = 0.64 * expression;
        face.brow = -0.32 * expression;
        face.blink *= 1 - expression;
        break;
      }
      case "laugh": {
        const standing = ease((t - 0.12) / 0.5) * ease((seconds - t) / 0.65) * release;
        const hands = ease((t - 0.1) / 0.4) * ease((seconds - t) / 0.55) * release;
        let chuckle = 0;
        for (const beat of LAUGH_BEATS_SECONDS) chuckle += pulse(t, beat, 0.18);
        chuckle *= release;
        const jump = (pulse(t, 0.7, 0.46) + pulse(t, 1.34, 0.46) + pulse(t, 1.98, 0.46)) * standing;
        const crouch = (pulse(t, 0.58, 0.2) + pulse(t, 1.22, 0.2) + pulse(t, 1.86, 0.2)) * standing;
        this.legs?.pose(standing * (1 - crouch * 0.08));
        this.body.position.y += AVATAR_STAND_RISE * standing + jump * 0.16 - crouch * 0.035;
        this.body.position.z += AVATAR_STAND_FORWARD * standing;
        this.body.rotation.x += pulse(t, 0.04, 0.5) * 0.11 + (0.025 + chuckle * 0.065) * standing;
        this.body.rotation.z += Math.sin(t * 7) * 0.026 * standing;
        this.head.rotation.x -= (0.18 - chuckle * 0.1) * standing;
        this.head.rotation.z += Math.sin(t * 5.5) * 0.07 * standing;
        this.leftArm.gesture(-0.48, 2.54 + chuckle * 0.06, 0.23, 0, 0.18, -0.22, hands, RELIEF_ARM);
        this.rightArm.gesture(0.48, 2.54 + chuckle * 0.06, 0.23, 0, -0.18, 0.22, hands, RELIEF_ARM);
        this.leftArm.poseFingers(FIST, 0.025, 0.85, hands);
        this.rightArm.poseFingers(FIST, 0.025, 0.85, hands);
        face.smile = 0.08 + 0.9 * expression;
        face.open = (0.2 + chuckle * 0.74) * standing;
        face.squint = (0.62 + chuckle * 0.22) * expression;
        face.brow = 0.18 * expression;
        this.cards.visible = hands < 0.025 && standing < 0.025;
        break;
      }
      case "good-move": {
        // Form the fist near the table, then raise it and reveal the thumb.
        // Keep the fist closed while lowering; only relax it near the rest pose.
        const lift = ease((t - 0.18) / 0.63) * ease((3 - t) / 0.7) * release;
        const fist = ease((t - 0.035) / 0.4) * ease((3 - t) / 0.32) * release;
        const thumb = ease((t - 0.43) / 0.36) * ease((3 - t) / 0.5);
        const settle = pulse(t, 0.65, 0.5) * 0.014;
        this.rightArm.gesture(
          0.48,
          1.99 + settle,
          0.43 + pulse(t, 0.72, 0.68) * 0.012,
          0,
          -0.65,
          -0.9,
          lift,
          APPROVAL_ARM,
        );
        this.rightArm.poseFingers(FIST, 0, 0.82, fist, thumb);
        this.head.rotation.x += pulse(t, 0.84, 0.68) * 0.095 * lift;
        this.head.rotation.z -= 0.025 * lift;
        this.body.rotation.x += 0.012 * lift;
        face.smile += 0.56 * expression;
        face.squint = 0.24 * expression;
        face.brow = 0.1 * expression;
        break;
      }
      case "bravo": {
        // Three measured contacts, each with a quicker closing and softer release.
        const clapTime = Math.max(0, t - 0.62);
        const cycle = (clapTime % 0.48) / 0.48;
        const close =
          cycle < 0.34 ? ease(cycle / 0.34) : cycle < 0.43 ? 1 : 1 - ease((cycle - 0.43) / 0.57);
        const contact = t >= 0.62 && t < 2.06 ? close : 0;
        const spread = 0.14 - contact * 0.11;
        this.leftArm.gesture(-spread, 1.91, 0.67, 0.04, Math.PI / 2, -0.12, gesture);
        this.rightArm.gesture(spread, 1.92, 0.66, 0.04, -Math.PI / 2, 0.12, gesture);
        this.leftArm.poseFingers(CUPPED, 0.06, 0.35, fingers);
        this.rightArm.poseFingers(CUPPED, 0.06, 0.35, fingers);
        this.head.rotation.x += (0.035 + contact * 0.02) * gesture;
        face.smile += 0.85 * expression;
        face.squint = 0.38 * expression;
        face.open = 0.1 * expression;
        this.cards.visible = fingers < 0.04 && gesture < 0.04;
        break;
      }
      case "wow": {
        const recovery = ease((t - 1.1) / 0.7);
        const rightGesture = ease((t - 0.2) / 0.5) * returnWeight;
        this.body.rotation.x -= (0.055 - recovery * 0.025) * gesture;
        this.head.rotation.x -= (0.11 - recovery * 0.055) * gesture;
        this.leftArm.gesture(-0.29, 2.06 - recovery * 0.018, 0.36, 0.02, 0.35, -0.18, gesture);
        this.rightArm.gesture(0.29, 2.04 - recovery * 0.028, 0.37, 0.02, -0.35, 0.18, rightGesture);
        this.leftArm.poseFingers(OPEN, 0.85 - recovery * 0.2, 0.06, fingers);
        this.rightArm.poseFingers(OPEN, 0.8 - recovery * 0.2, 0.06, fingers);
        face.smile = 0.08 * (1 - expression) + recovery * 0.15 * expression;
        face.brow = (0.95 - recovery * 0.28) * expression;
        face.open = (0.85 - recovery * 0.43) * expression;
        face.blink *= 1 - expression;
        this.cards.visible = fingers < 0.04 && gesture < 0.04;
        break;
      }
      case "nice":
        this.rightArm.gesture(0.44, 1.96, 0.6, -0.16, -0.42, -0.3, gesture);
        this.rightArm.poseFingers(POINT, 0.18, 0.35, fingers);
        this.head.rotation.z -= 0.075 * gesture;
        this.head.rotation.x += pulse(t, 0.68, 0.72) * 0.065 * gesture;
        face.smile += 0.65 * expression;
        face.squint = 0.45 * expression;
        face.brow = -0.12 * expression;
        break;
      case "lucky": {
        const wipe = ease((t - 0.82) / 0.8);
        this.rightArm.gesture(
          0.3 + wipe * 0.09,
          2.2 - wipe * 0.035,
          0.33,
          0.02,
          -0.35,
          0.1,
          gesture,
          RELIEF_ARM,
        );
        this.rightArm.poseFingers(CUPPED, 0.13, 0.35, fingers);
        this.head.rotation.x += 0.065 * gesture;
        this.body.position.y -= pulse(t, 0.6, 1.6) * 0.012 * gesture;
        face.smile += 0.5 * expression * ease((t - 0.5) / 0.6);
        face.squint = 0.7 * expression;
        face.brow = 0.28 * expression;
        face.open = 0.14 * expression * (1 - wipe);
        break;
      }
      case "fire": {
        const leftLift = pulse(t, 0.58, 0.75) * 0.06 + pulse(t, 1.42, 0.65) * 0.04;
        const rightLift = pulse(t, 0.67, 0.75) * 0.065 + pulse(t, 1.51, 0.65) * 0.035;
        const rightGesture = ease((t - 0.2) / 0.5) * returnWeight;
        this.leftArm.gesture(-0.42, 2.08 + leftLift, 0.43, -0.1, 0.18, -0.32, gesture);
        this.rightArm.gesture(0.42, 2.06 + rightLift, 0.45, -0.1, -0.18, 0.3, rightGesture);
        this.leftArm.poseFingers(FIST, 0, 0.92, fingers);
        this.rightArm.poseFingers(FIST, 0, 0.92, fingers);
        this.body.rotation.x -= 0.025 * gesture;
        face.smile += 0.9 * expression;
        face.open = 0.38 * expression;
        face.squint = 0.32 * expression;
        face.brow = 0.22 * expression;
        this.cards.visible = fingers < 0.04 && gesture < 0.04;
        break;
      }
    }
    this.face?.pose(face);
  }
}
