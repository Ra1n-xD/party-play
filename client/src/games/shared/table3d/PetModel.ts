import * as THREE from "three";
import { type PetSpecies } from "../../../../../shared/platform/pet";
import { PetBehavior } from "./PetBehavior";

const colors: Record<PetSpecies, string> = {
  dragon: "#69dfb7",
  cat: "#b5a6ef",
  fox: "#ed9b52",
  rabbit: "#e9e3dd",
  owl: "#bd9467",
};

/** One rig for the nursery and every table: poses never change the outer placement/scale. */
export class PetModel {
  readonly root = new THREE.Group();
  private readonly pose = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly ears: THREE.Group[] = [];
  private readonly wings: THREE.Group[] = [];
  private readonly paws: THREE.Group[] = [];
  private readonly feet: THREE.Group[] = [];
  private readonly eyes: THREE.Mesh[] = [];
  private readonly eyeLights: THREE.Mesh[] = [];
  private readonly sparks: THREE.Mesh[] = [];
  private readonly behavior: PetBehavior;
  private readonly bodyScale: number;
  private readonly sparkleMaterial = new THREE.MeshBasicMaterial({
    color: "#ffb8d3",
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  constructor(
    readonly stage: number,
    readonly species: PetSpecies,
  ) {
    this.behavior = new PetBehavior(stage, species);
    this.bodyScale = stage === 1 ? 0.72 : stage === 2 ? 0.87 : 1;
    const coat = new THREE.MeshStandardMaterial({ color: colors[species], roughness: 0.75 });
    const cream = new THREE.MeshStandardMaterial({ color: "#fff0d6", roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: "#253047", roughness: 0.35 });
    const pink = new THREE.MeshStandardMaterial({ color: "#efa5bb", roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: "#edb45a", roughness: 0.7 });
    const ball = (
      parent: THREE.Group,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy = sx,
      sz = sx,
    ) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const cone = (
      parent: THREE.Group,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      radius: number,
      height: number,
    ) => {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 16), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    this.root.name = `pet-${species}`;
    this.root.add(this.pose);
    if (stage === 0) {
      ball(this.pose, cream, 0, 0.35, 0, 0.26, 0.35, 0.26);
      ball(this.pose, coat, -0.1, 0.43, 0.23, 0.065, 0.08, 0.02);
      ball(this.pose, coat, 0.12, 0.25, 0.22, 0.08, 0.06, 0.02);
      ball(this.pose, coat, 0.05, 0.6, 0.14, 0.045, 0.04, 0.02);
    } else {
      this.pose.scale.setScalar(this.bodyScale);
      ball(this.pose, coat, 0, 0.32, 0, 0.31, 0.34, 0.25);
      ball(this.pose, cream, 0, 0.29, 0.22, 0.21, 0.23, 0.06);
      this.head.position.y = 0.68;
      this.pose.add(this.head);
      ball(this.head, coat, 0, 0, 0.025, 0.36, 0.3, 0.29);
      for (const sign of [-1, 1]) {
        const foot = new THREE.Group();
        foot.position.set(sign * 0.19, 0.08, 0.18);
        this.pose.add(foot);
        this.feet.push(foot);
        ball(foot, species === "owl" ? gold : coat, 0, 0, 0, 0.14, 0.09, 0.19);
        const paw = new THREE.Group();
        paw.position.set(sign * 0.29, 0.42, 0.1);
        this.pose.add(paw);
        this.paws.push(paw);
        ball(paw, coat, 0, -0.09, 0, 0.09, 0.17, 0.11);
        if (species === "owl") ball(this.head, cream, sign * 0.145, 0.02, 0.255, 0.17, 0.19, 0.05);
        const eye = ball(
          this.head,
          dark,
          sign * 0.14,
          0.045,
          species === "owl" ? 0.31 : 0.294,
          species === "owl" ? 0.068 : 0.041,
          0.064,
          0.025,
        );
        this.eyes.push(eye);
        this.eyeLights.push(
          ball(this.head, cream, sign * 0.135, 0.063, species === "owl" ? 0.333 : 0.316, 0.014),
        );
        if (species !== "owl")
          ball(this.head, pink, sign * 0.235, -0.055, 0.262, 0.058, 0.025, 0.018);
        const ear = new THREE.Group();
        ear.position.set(sign * 0.23, 0.235, 0);
        this.head.add(ear);
        this.ears.push(ear);
        if (species === "rabbit") {
          ball(ear, coat, 0, 0.22, 0, 0.09, 0.3, 0.065);
          ball(ear, pink, 0, 0.22, 0.056, 0.048, 0.23, 0.014);
        } else if (species === "dragon") {
          cone(ear, cream, 0, 0.04, 0, 0.07, stage === 3 ? 0.24 : 0.14);
        } else {
          cone(
            ear,
            coat,
            0,
            0.04,
            0,
            species === "owl" ? 0.08 : 0.115,
            species === "fox" ? 0.29 : 0.21,
          );
          if (species !== "owl") cone(ear, pink, 0, 0.035, 0.06, 0.057, 0.13);
        }
        if (species === "owl" || (species === "dragon" && stage >= 2)) {
          const wing = new THREE.Group();
          wing.position.set(sign * 0.25, 0.52, -0.13);
          this.pose.add(wing);
          this.wings.push(wing);
          ball(wing, coat, sign * 0.15, -0.1, 0, stage === 3 ? 0.22 : 0.17, 0.25, 0.065);
          if (species === "owl") ball(wing, cream, sign * 0.21, -0.14, 0.048, 0.055, 0.12, 0.02);
        }
      }
      if (species === "fox") {
        ball(this.head, cream, 0, -0.115, 0.265, 0.16, 0.1, 0.17);
        ball(this.head, dark, 0, -0.09, 0.407, 0.045, 0.031, 0.023);
      } else if (species === "owl") {
        const beak = cone(this.head, gold, 0, -0.08, 0.31, 0.06, 0.14);
        beak.rotation.x = Math.PI / 2;
      } else {
        ball(this.head, species === "rabbit" ? pink : dark, 0, -0.1, 0.3, 0.033, 0.022, 0.02);
      }
      this.tail.position.set(0.1, 0.18, -0.2);
      this.pose.add(this.tail);
      if (species === "rabbit") ball(this.tail, cream, 0, 0, -0.13, 0.15);
      else if (species === "fox") {
        ball(this.tail, coat, 0.18, 0.04, -0.22, 0.2, 0.2, 0.36);
        ball(this.tail, cream, 0.2, 0.065, -0.48, 0.14, 0.15, 0.19);
      } else if (species === "cat") {
        const tail = new THREE.Mesh(
          new THREE.TorusGeometry(0.24, 0.064, 10, 22, Math.PI * 1.35),
          coat,
        );
        tail.position.set(0.17, 0.04, -0.15);
        this.tail.add(tail);
      } else if (species === "dragon") ball(this.tail, coat, 0, -0.015, -0.15, 0.12, 0.13, 0.3);
    }
    const heart = new THREE.Shape();
    heart.moveTo(0, 0.04);
    heart.bezierCurveTo(-0.18, 0.24, -0.3, -0.05, 0, -0.24);
    heart.bezierCurveTo(0.3, -0.05, 0.18, 0.24, 0, 0.04);
    const geometry = new THREE.ShapeGeometry(heart, 12);
    this.sparkleMaterial.side = THREE.DoubleSide;
    for (let i = 0; i < 3; i++) {
      const spark = new THREE.Mesh(geometry, this.sparkleMaterial);
      spark.visible = false;
      this.root.add(spark);
      this.sparks.push(spark);
    }
  }

  react(time: number): string {
    return this.behavior.react(time);
  }

  getInteractionCenter(target: THREE.Vector3): THREE.Vector3 {
    return this.pose.localToWorld(target.set(0, this.stage === 0 ? 0.35 : 0.5, 0));
  }

  getInteractionRadius(): number {
    return 0.4 * this.bodyScale * this.root.scale.x;
  }

  frame(time: number, reducedMotion: boolean, paused = false) {
    this.behavior.frame(time, reducedMotion, paused);
    if (paused) return;
    const t = this.behavior.time / 1000;
    const idle = reducedMotion ? 0 : 1;
    this.pose.position.set(0, Math.sin(t * 2.2) * 0.009 * idle, 0);
    this.pose.rotation.set(
      0,
      Math.sin(t * 0.65) * 0.09 * idle,
      this.stage === 0 ? Math.sin(t * 2) * 0.045 * idle : 0,
    );
    this.pose.scale.setScalar(this.bodyScale);
    this.head.position.set(0, 0.68, 0);
    this.head.scale.setScalar(1);
    this.head.rotation.set(Math.sin(t) * 0.035 * idle, 0, Math.sin(t * 0.8) * 0.045 * idle);
    this.tail.rotation.y = Math.sin(t * 2.6) * 0.18 * idle;
    this.ears.forEach((ear, i) => {
      ear.rotation.z = (i === 0 ? -1 : 1) * (0.12 + Math.sin(t * 1.6) * 0.035 * idle);
    });
    this.wings.forEach((wing, i) => {
      wing.rotation.z = (i === 0 ? -1 : 1) * Math.sin(t * 1.8) * 0.08 * idle;
    });
    this.paws.forEach((paw) => paw.rotation.set(0, 0, 0));
    this.feet.forEach((foot) => foot.rotation.set(0, 0, 0));
    let closedEyes = 0;
    const motion = this.behavior.motion;
    if (motion) {
      const u = THREE.MathUtils.clamp(
        (this.behavior.time - motion.startedAt) / motion.duration,
        0,
        1,
      );
      const envelope =
        THREE.MathUtils.smoothstep(u, 0, 0.18) * (1 - THREE.MathUtils.smoothstep(u, 0.82, 1));
      const cycle = u * Math.PI * 2;
      switch (motion.kind) {
        case "egg-rock":
          this.pose.rotation.z += Math.sin(cycle * 2) * 0.22 * envelope;
          this.pose.position.y += 0.04 * envelope;
          break;
        case "egg-tap":
          this.pose.scale.y *= 1 + Math.sin(cycle * 5) * 0.07 * envelope;
          this.pose.position.y += Math.abs(Math.sin(cycle * 3)) * 0.035 * envelope;
          break;
        case "egg-roll":
          this.pose.position.x = Math.sin(cycle) * 0.18 * envelope;
          this.pose.rotation.z += -Math.sin(cycle) * 0.42 * envelope;
          this.pose.position.y += 0.07 * envelope;
          break;
        case "hop": {
          const hop = Math.max(0, Math.sin(u * Math.PI * (this.stage === 1 ? 4 : 6))) * envelope;
          this.pose.position.y += hop * (this.stage === 1 ? 0.18 : 0.28);
          this.pose.scale.y *= 1 - 0.1 * envelope + 0.15 * hop;
          this.head.rotation.x -= 0.12 * envelope;
          this.paws.forEach((paw) => (paw.rotation.x = -0.3 * envelope));
          break;
        }
        case "wave":
          if (this.paws[1]) this.paws[1].rotation.z = -(1.9 + Math.sin(cycle * 4) * 0.3) * envelope;
          this.head.rotation.z += 0.15 * envelope;
          this.tail.rotation.y += Math.sin(cycle * 4) * 0.5 * envelope;
          break;
        case "twirl":
          this.pose.rotation.y += Math.PI * 2 * THREE.MathUtils.smoothstep(u, 0, 1);
          this.pose.position.y += Math.abs(Math.sin(cycle * 2)) * 0.055 * envelope;
          this.paws.forEach((paw, i) => (paw.rotation.z = (i ? -0.45 : 0.45) * envelope));
          this.feet.forEach(
            (foot, i) => (foot.rotation.x = Math.sin(cycle * 5 + i * Math.PI) * 0.35 * envelope),
          );
          break;
        case "nuzzle":
          this.pose.position.z = 0.18 * envelope;
          this.pose.rotation.x = -0.08 * envelope;
          this.head.rotation.x -= 0.18 * envelope;
          this.head.rotation.z += Math.sin(cycle) * 0.2 * envelope;
          closedEyes = envelope * 0.85;
          break;
        case "look":
          this.head.rotation.z += Math.sin(cycle) * 0.4 * envelope;
          this.head.rotation.y = Math.sin(cycle * 1.5) * 0.3 * envelope;
          break;
        case "flutter":
          this.pose.position.y += 0.12 * envelope;
          this.wings.forEach(
            (wing, i) =>
              (wing.rotation.z = (i ? 1 : -1) * (0.45 + Math.sin(cycle * 8) * 0.5) * envelope),
          );
          this.paws.forEach((paw, i) => (paw.rotation.z = (i ? -0.35 : 0.35) * envelope));
          break;
        case "toddle":
        case "scamper":
        case "stroll": {
          const running = motion.kind === "scamper";
          const steps = running ? 12 : motion.kind === "toddle" ? 7 : 5;
          const travel = (running ? 0.35 : motion.kind === "toddle" ? 0.18 : 0.24) * envelope;
          this.pose.position.x = Math.sin(cycle) * travel;
          this.pose.position.z = (Math.cos(cycle) - 1) * travel * 0.55;
          this.pose.position.y +=
            Math.abs(Math.sin(u * Math.PI * steps)) * (running ? 0.07 : 0.025) * envelope;
          this.pose.rotation.y += Math.sin(cycle + 0.8) * 0.8 * envelope;
          this.head.rotation.x += Math.sin(cycle * steps) * 0.06 * envelope;
          this.feet.forEach(
            (foot, i) =>
              (foot.rotation.x = Math.sin(u * Math.PI * steps + i * Math.PI) * 0.65 * envelope),
          );
          this.paws.forEach(
            (paw, i) =>
              (paw.rotation.x = -Math.sin(u * Math.PI * steps + i * Math.PI) * 0.5 * envelope),
          );
          break;
        }
        case "nap":
          this.pose.scale.y *= 1 - 0.4 * envelope;
          this.head.scale.y = 1 / (1 - 0.4 * envelope);
          this.head.position.y -= 0.2 * envelope;
          this.head.position.z = 0.08 * envelope;
          this.head.rotation.x += 0.22 * envelope;
          this.paws.forEach((paw) => (paw.rotation.x = -0.8 * envelope));
          closedEyes = envelope;
          break;
        case "stretch":
          this.pose.scale.y *= 1 + 0.12 * envelope;
          this.head.position.y += 0.06 * envelope;
          this.head.rotation.x -= 0.25 * envelope;
          this.paws.forEach((paw) => (paw.rotation.x = -0.95 * envelope));
          this.feet.forEach((foot) => (foot.rotation.x = -0.25 * envelope));
          break;
        case "groom":
          this.head.position.y -= 0.1 * envelope;
          this.head.rotation.x += 0.45 * envelope;
          this.head.rotation.z -= 0.12 * envelope;
          if (this.paws[1]) {
            this.paws[1].rotation.z = -1.45 * envelope;
            this.paws[1].rotation.x = (-0.7 + Math.sin(cycle * 6) * 0.15) * envelope;
          }
          closedEyes = envelope * 0.75;
          break;
      }
    }
    const blink = idle && t % 4.6 < 0.16 ? 0.08 : Math.max(0.06, 1 - closedEyes);
    this.eyes.forEach((eye) => (eye.scale.y = 0.064 * blink));
    this.eyeLights.forEach((light) => {
      light.visible = blink > 0.4;
    });
    const elapsed = (this.behavior.time - this.behavior.reactionStartedAt) / 2000;
    const active = elapsed >= 0 && elapsed < 1;
    const u = active ? elapsed : 0;
    this.sparkleMaterial.opacity = active ? Math.sin(u * Math.PI) * 0.85 : 0;
    this.sparks.forEach((spark, i) => {
      spark.visible = active;
      spark.position.set(
        this.pose.position.x + (i - 1) * 0.32,
        this.pose.position.y +
          (this.stage === 0 ? 0.75 : 1.2) +
          (reducedMotion ? 0 : u * 0.3) +
          (i % 2) * 0.15,
        this.pose.position.z + 0.2,
      );
      spark.scale.setScalar(0.35);
      spark.rotation.z = (i - 1) * -0.15;
    });
  }
}

export function disposePetModel(pet: THREE.Group) {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  pet.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      geometries.add(child.geometry);
      for (const m of Array.isArray(child.material) ? child.material : [child.material])
        materials.add(m);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
