import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

/** Fingers stay behind the card plane; only the thumb wraps around the bottom edge. */
export function makeAvatarHand(skin: number, side: number, holding: boolean) {
  const hand = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.68 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
  palm.scale.set(0.069, 0.081, 0.029);
  palm.position.set(0, -0.002, holding ? -0.048 : 0);
  hand.add(palm);
  const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.064, 4, 12), material);
  wrist.scale.z = 0.78;
  wrist.position.set(0, -0.102, holding ? -0.045 : 0);
  hand.add(wrist);

  const finger = (points: THREE.Vector3[], radius: number) => {
    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      12,
      radius,
      8,
      false,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    hand.add(mesh);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
    tip.position.copy(points[points.length - 1]);
    hand.add(tip);
  };
  for (let i = 0; i < 4; i++) {
    const x = side * (0.047 - i * 0.031);
    const length = [0.077, 0.088, 0.082, 0.063][i];
    finger(
      [
        new THREE.Vector3(x, 0.053, holding ? -0.048 : 0),
        new THREE.Vector3(x, 0.063 + length * 0.55, holding ? -0.064 : 0.005),
        new THREE.Vector3(x, 0.061 + length * 0.86, holding ? -0.052 : 0.017),
        new THREE.Vector3(
          x,
          holding ? 0.094 + length * 0.2 : 0.059 + length,
          holding ? -0.027 : 0.035,
        ),
      ],
      0.0125 - (i === 3 ? 0.002 : 0),
    );
  }
  finger(
    [
      new THREE.Vector3(side * 0.05, -0.025, holding ? -0.04 : 0.008),
      new THREE.Vector3(side * 0.082, 0.025, holding ? -0.022 : 0.014),
      new THREE.Vector3(side * (holding ? 0.064 : 0.094), 0.061, holding ? 0.013 : 0.021),
      new THREE.Vector3(
        side * (holding ? 0.027 : 0.087),
        holding ? 0.098 : 0.078,
        holding ? 0.022 : 0.035,
      ),
    ],
    0.014,
  );
  // A hand shares one material: merge its details instead of adding a draw call per finger.
  hand.updateMatrixWorld(true);
  const pieces = hand.children.map((part) => {
    const mesh = part as THREE.Mesh;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    if (geometry !== mesh.geometry) mesh.geometry.dispose();
    return geometry.applyMatrix4(mesh.matrix);
  });
  const geometry = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  hand.clear();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  hand.add(mesh);
  return hand;
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

/** Two comparable arm segments, a visible elbow bend and a wrist aligned with the grip. */
export function makeSeatedArm(
  skin: number,
  sleeve: THREE.Material,
  side: number,
  holding: boolean,
) {
  const root = new THREE.Group();
  const shoulder = new THREE.Vector3(side * 0.33, 1.81, 0.045);
  root.position.copy(shoulder);
  const elbow = new THREE.Vector3(side * 0.48, 1.626, 0.32).sub(shoulder);
  limbBetween(root, new THREE.Vector3(), elbow, 0.112, sleeve, 0.096);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), sleeve);
  joint.position.copy(elbow);
  joint.castShadow = joint.receiveShadow = true;
  root.add(joint);
  const grip = new THREE.Group();
  root.add(grip);
  const cuffMaterial = new THREE.MeshStandardMaterial({ color: 0xeee5d4, roughness: 0.85 });
  const cuff = roundedPart([0.104, 0.065, 0.084], cuffMaterial, 0.015);
  root.add(cuff);
  let currentHolding: boolean | null = null;
  let palm: THREE.Group | null = null;
  let forearm: THREE.Mesh | null = null;
  const setHolding = (next: boolean) => {
    if (next === currentHolding) return;
    currentHolding = next;
    if (palm) {
      grip.remove(palm);
      palm.traverse((part) => {
        if (part instanceof THREE.Mesh) {
          part.geometry.dispose();
          (part.material as THREE.Material).dispose();
        }
      });
    }
    palm = makeAvatarHand(skin, -side, next);
    grip.add(palm);
    grip.position.set(side * 0.24, next ? 1.76 : 1.605, next ? 0.5 : 0.8).sub(shoulder);
    grip.rotation.set(next ? 0 : 1.88, next ? -0.12 : 0, next ? side * 0.12 : -side * 0.08);
    const wrist = new THREE.Vector3(0, -0.14, next ? -0.045 : 0)
      .applyEuler(grip.rotation)
      .add(grip.position);
    if (forearm) {
      root.remove(forearm);
      forearm.geometry.dispose();
    }
    forearm = limbBetween(root, elbow, wrist, 0.092, sleeve, 0.06);
    cuff.position.copy(wrist);
    cuff.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      wrist.clone().sub(elbow).normalize(),
    );
  };
  setHolding(holding);
  return { root, grip, setHolding };
}
