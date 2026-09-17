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

/** Palm faces +Z, fingers point +Y. A closed grip keeps fingertips behind the cards. */
export function makeAvatarHand(skin: number, side: number, holding: boolean) {
  const hand = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.68 });
  const palm = roundedPart([0.143, 0.16, 0.055], material, 0.026);
  hand.add(palm);
  const wrist = roundedPart([0.098, 0.1, 0.055], material, 0.024);
  wrist.position.y = -0.095;
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
    const x = -0.051 + i * 0.034;
    const length = [0.09, 0.105, 0.098, 0.078][i];
    finger(
      [
        new THREE.Vector3(x, 0.052, 0),
        new THREE.Vector3(x, 0.077 + length * 0.35, holding ? -0.006 : 0.005),
        new THREE.Vector3(x, 0.067 + length * 0.65, holding ? -0.035 : 0.006),
        new THREE.Vector3(x, holding ? 0.07 : 0.052 + length, holding ? -0.056 : -0.009),
      ],
      0.014 - (i === 3 ? 0.002 : 0),
    );
  }
  finger(
    [
      new THREE.Vector3(side * 0.052, -0.037, 0.014),
      new THREE.Vector3(side * 0.08, -0.002, 0.032),
      new THREE.Vector3(side * 0.061, 0.037, 0.047),
      new THREE.Vector3(side * 0.025, 0.055, 0.043),
    ],
    0.019,
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
) {
  const length = start.distanceTo(end);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 6, 16),
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
