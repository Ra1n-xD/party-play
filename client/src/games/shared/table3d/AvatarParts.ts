import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { makeArticulatedHand } from "./AvatarHand";

export function roundedPart(
  size: [number, number, number],
  material: THREE.Material,
  radius = 0.025,
) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 3, radius), material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** The card plane is Z=0; its bottom edge sits this far above the palm centre. */
export const HAND_CARD_EDGE_Y = 0.078;

/** The same articulated skin is shared by seated avatars and the camera-local hand. */
export function makeAvatarHand(skin: number, side: number, holding: boolean) {
  return makeArticulatedHand(skin, side, holding).root;
}

export function limbBetween(
  parent: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  endRadius = radius * 0.78,
) {
  const length = start.distanceTo(end);
  const cap = Math.min(length * 0.24, radius);
  const half = length / 2;
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0, -half],
        [radius * 0.72, -half + cap * 0.25],
        [radius, -half + cap],
        [endRadius, half - cap],
        [endRadius * 0.72, half - cap * 0.25],
        [0, half],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    ),
    material,
  );
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    end.clone().sub(start).normalize(),
  );
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A continuous sleeve follows a two-bone solve; limb lengths stay constant during gestures. */
export function makeSeatedArm(
  skin: number,
  sleeve: THREE.Material,
  side: number,
  holding: boolean,
) {
  const root = new THREE.Group();
  const shoulder = new THREE.Vector3(side * 0.33, 1.81, 0.045);
  root.position.copy(shoulder);
  const grip = new THREE.Group();
  root.add(grip);
  const upperLength = 0.37;
  const lowerLength = 0.38;
  const up = new THREE.Vector3(0, 1, 0);
  const elbow = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const wristOffset = new THREE.Vector3();
  const upperDirection = new THREE.Vector3();
  const lowerDirection = new THREE.Vector3();
  const bindUpper = new THREE.Vector3();
  const bindLower = new THREE.Vector3();
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.057, 0.063, 0.061, 20),
    new THREE.MeshStandardMaterial({ color: 0xeee5d4, roughness: 0.85 }),
  );
  cuff.name = "animated-cuff";
  cuff.castShadow = cuff.receiveShadow = true;
  root.add(cuff);
  const upperBone = new THREE.Bone();
  const lowerBone = new THREE.Bone();
  upperBone.name = "shoulder";
  lowerBone.name = "elbow";
  let sleeveMesh: THREE.SkinnedMesh | null = null;
  let currentHolding: boolean | null = null;
  let gestureFingerWeight = 0;
  let hand: ReturnType<typeof makeArticulatedHand> | null = null;
  const restPosition = new THREE.Vector3();
  const restRotation = new THREE.Quaternion();
  const targetPosition = new THREE.Vector3();
  const targetRotation = new THREE.Quaternion();
  const targetEuler = new THREE.Euler();

  const updateArm = () => {
    wristOffset
      .set(0, -0.14, currentHolding ? -0.045 * (1 - gestureFingerWeight) : 0)
      .applyQuaternion(grip.quaternion);
    wrist.copy(grip.position).add(wristOffset);
    const distance = THREE.MathUtils.clamp(wrist.length(), 0.1, upperLength + lowerLength - 0.008);
    direction.copy(wrist).normalize();
    wrist.copy(direction).multiplyScalar(distance);
    // Keep the actual palm attached when a requested target exceeds arm reach.
    grip.position.copy(wrist).sub(wristOffset);
    const projection =
      (upperLength * upperLength - lowerLength * lowerLength + distance * distance) /
      (2 * distance);
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - projection * projection));
    bend.set(side * 0.85, -0.75, -0.12).addScaledVector(direction, -bend.dot(direction));
    if (bend.lengthSq() < 0.0001)
      bend.set(side, 0, 0).addScaledVector(direction, -side * direction.x);
    bend.normalize();
    elbow.copy(direction).multiplyScalar(projection).addScaledVector(bend, height);
    upperDirection.copy(elbow).normalize();
    lowerDirection.copy(wrist).sub(elbow).normalize();
    if (sleeveMesh) {
      upperBone.quaternion.setFromUnitVectors(bindUpper, upperDirection);
      lowerBone.position.copy(elbow);
      lowerBone.quaternion.setFromUnitVectors(bindLower, lowerDirection);
    }
    cuff.position.copy(wrist);
    cuff.quaternion.setFromUnitVectors(up, lowerDirection);
  };

  const makeSleeve = () => {
    const positions: number[] = [];
    const indices: number[] = [];
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    const center = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const radialX = new THREE.Vector3();
    const radialZ = new THREE.Vector3();
    const vertex = new THREE.Vector3();
    const rows = 29;
    const sides = 20;
    const bindElbow = elbow.clone();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3().addScaledVector(upperDirection, -0.055),
      elbow.clone().multiplyScalar(0.5),
      elbow.clone(),
      elbow.clone().lerp(wrist, 0.52),
      wrist.clone(),
    ]);
    for (let row = 0; row < rows; row++) {
      const t = row / (rows - 1);
      curve.getPoint(t, center);
      curve.getTangent(t, tangent).normalize();
      radialX.set(0, 0, 1).cross(tangent).normalize();
      radialZ.copy(tangent).cross(radialX).normalize();
      const radius =
        t < 0.15
          ? THREE.MathUtils.lerp(0.086, 0.112, t / 0.15)
          : t < 0.5
            ? THREE.MathUtils.lerp(0.112, 0.088, (t - 0.15) / 0.35)
            : THREE.MathUtils.lerp(0.088, 0.059, (t - 0.5) / 0.5);
      const blend = THREE.MathUtils.smoothstep(t, 0.38, 0.62);
      for (let segment = 0; segment <= sides; segment++) {
        const angle = (segment / sides) * Math.PI * 2;
        // Very shallow woven folds break a perfect cylinder silhouette without loose parts.
        const fold = 1 + Math.sin(t * Math.PI * 10) * Math.exp(-(((t - 0.52) / 0.2) ** 2)) * 0.022;
        vertex
          .copy(center)
          .addScaledVector(radialX, Math.cos(angle) * radius * fold)
          .addScaledVector(radialZ, Math.sin(angle) * radius * 0.94 * fold);
        positions.push(vertex.x, vertex.y, vertex.z);
        skinIndices.push(0, 1, 0, 0);
        skinWeights.push(1 - blend, blend, 0, 0);
        if (row < rows - 1 && segment < sides) {
          const a = row * (sides + 1) + segment;
          const b = a + sides + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    sleeveMesh = new THREE.SkinnedMesh(geometry, sleeve);
    sleeveMesh.name = "articulated-sleeve";
    sleeveMesh.castShadow = sleeveMesh.receiveShadow = true;
    sleeveMesh.frustumCulled = false;
    bindUpper.copy(upperDirection);
    bindLower.copy(lowerDirection);
    lowerBone.position.copy(bindElbow);
    sleeveMesh.add(upperBone, lowerBone);
    const skeleton = new THREE.Skeleton([upperBone, lowerBone]);
    sleeveMesh.bind(skeleton);
    geometry.addEventListener("dispose", () => skeleton.dispose());
    root.add(sleeveMesh);
  };

  const setHolding = (next: boolean) => {
    if (next === currentHolding) return;
    currentHolding = next;
    gestureFingerWeight = 0;
    if (hand) {
      grip.remove(hand.root);
      hand.root.traverse((part) => {
        if (part instanceof THREE.Mesh) {
          part.geometry.dispose();
          (part.material as THREE.Material).dispose();
        }
      });
    }
    hand = makeArticulatedHand(skin, -side, next);
    grip.add(hand.root);
    grip.position.set(side * 0.24, next ? 1.76 : 1.605, next ? 0.5 : 0.8).sub(shoulder);
    grip.rotation.set(next ? 0 : 1.88, next ? -0.12 : 0, next ? side * 0.12 : -side * 0.08);
    updateArm();
    restPosition.copy(grip.position);
    restRotation.copy(grip.quaternion);
  };
  setHolding(holding);
  makeSleeve();
  return {
    root,
    grip,
    setHolding,
    resetGesture() {
      grip.position.copy(restPosition);
      grip.quaternion.copy(restRotation);
      gestureFingerWeight = 0;
      hand?.reset();
      updateArm();
    },
    poseFingers(curls: readonly number[], spread: number, thumb: number, weight: number) {
      gestureFingerWeight = THREE.MathUtils.clamp(weight, 0, 1);
      hand?.pose(curls, spread, thumb, gestureFingerWeight);
      updateArm();
    },
    gesture(x: number, y: number, z: number, rx: number, ry: number, rz: number, weight: number) {
      const blend = THREE.MathUtils.clamp(weight, 0, 1);
      targetPosition.set(x, y, z).sub(shoulder);
      targetRotation.setFromEuler(targetEuler.set(rx, ry, rz));
      grip.position.copy(restPosition).lerp(targetPosition, blend);
      grip.quaternion.copy(restRotation).slerp(targetRotation, blend);
      updateArm();
    },
  };
}
