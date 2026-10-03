import * as THREE from "three";
import { roundedPart } from "./AvatarParts";

export const AVATAR_STAND_RISE = 0.43;
export const AVATAR_STAND_FORWARD = 0.18;

/** Seated and standing contours share topology; shoes stay on the floor during the rise. */
export function makeAvatarLegs(trousers: number, shoes: number, stitching: number) {
  const root = new THREE.Group();
  const legs: THREE.Mesh[] = [];
  const feet: THREE.Group[] = [];
  const trouserMaterial = new THREE.MeshStandardMaterial({ color: trousers, roughness: 0.82 });
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: shoes, roughness: 0.82 });
  const soleMaterial = new THREE.MeshStandardMaterial({ color: 0x202329, roughness: 0.82 });
  const seamMaterial = new THREE.MeshStandardMaterial({ color: stitching, roughness: 0.82 });
  const tube = (points: THREE.Vector3[]) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 32, 1, 16, false);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const progress = Math.floor(i / 17) / 32;
      const center = curve.getPointAt(progress);
      const radius = 0.146 - progress * 0.045;
      position.setXYZ(
        i,
        center.x + (position.getX(i) - center.x) * radius,
        center.y + (position.getY(i) - center.y) * radius,
        center.z + (position.getZ(i) - center.z) * radius,
      );
    }
    geometry.computeVertexNormals();
    return geometry;
  };
  for (const side of [-1, 1]) {
    const seated = tube([
      new THREE.Vector3(side * 0.2, 0.965, 0.015),
      new THREE.Vector3(side * 0.209, 0.937, 0.305),
      new THREE.Vector3(side * 0.211, 0.81, 0.534),
      new THREE.Vector3(side * 0.21, 0.5, 0.563),
      new THREE.Vector3(side * 0.21, 0.213, 0.567),
    ]);
    const standing = tube([
      new THREE.Vector3(side * 0.2, 0.965, 0.015),
      new THREE.Vector3(side * 0.209, 0.67, 0.11),
      new THREE.Vector3(side * 0.211, 0.36, 0.18),
      new THREE.Vector3(side * 0.21, 0.07, 0.22),
      new THREE.Vector3(side * 0.21, 0.213 - AVATAR_STAND_RISE, 0.237),
    ]);
    seated.morphAttributes.position = [standing.getAttribute("position").clone()];
    seated.morphAttributes.normal = [standing.getAttribute("normal").clone()];
    standing.dispose();
    const leg = new THREE.Mesh(seated, trouserMaterial);
    leg.name = "standing-leg";
    leg.castShadow = leg.receiveShadow = true;
    leg.frustumCulled = false;
    root.add(leg);
    legs.push(leg);

    const foot = new THREE.Group();
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), shoeMaterial);
    shoe.scale.set(0.143, 0.082, 0.24);
    shoe.position.set(side * 0.21, 0.172, 0.679);
    shoe.rotation.x = -0.045;
    shoe.castShadow = shoe.receiveShadow = true;
    const sole = roundedPart([0.276, 0.032, 0.443], soleMaterial, 0.00896);
    sole.position.set(side * 0.21, 0.105, 0.694);
    const seam = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.21 - 0.093, 0.204, 0.785),
          new THREE.Vector3(side * 0.21, 0.228, 0.819),
          new THREE.Vector3(side * 0.21 + 0.093, 0.204, 0.785),
        ]),
        24,
        0.003,
        5,
        false,
      ),
      seamMaterial,
    );
    seam.castShadow = seam.receiveShadow = true;
    foot.add(shoe, sole, seam);
    feet.push(foot);
    root.add(foot);
  }
  return {
    root,
    pose(amount: number) {
      const standing = THREE.MathUtils.clamp(amount, 0, 1);
      for (const leg of legs) leg.morphTargetInfluences![0] = standing;
      for (const foot of feet)
        foot.position.set(0, -AVATAR_STAND_RISE * standing, -0.33 * standing);
    },
  };
}

export type AvatarLegRig = ReturnType<typeof makeAvatarLegs>;
