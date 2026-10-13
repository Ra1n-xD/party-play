import * as THREE from "three";
import { getShipSkin, type ShipSkinId } from "../../../../../shared/games/battleship/skins";
import { roundedPart } from "../table3d/AvatarParts";

/** The same fleet identity and palette as ShipArtwork, modelled as tabletop miniatures. */
export function makeDuelShip(length: number, skinId: ShipSkinId | undefined, sunk: boolean) {
  const skin = getShipSkin(skinId);
  const group = new THREE.Group();
  const longship = skin.id === "arctic";
  const ghost = skin.id === "corsair";
  const dragon = skin.id === "royal";
  const width = length * 0.74 - 0.12;
  const finish = (color: string) =>
    new THREE.MeshStandardMaterial({
      color: sunk ? new THREE.Color(color).lerp(new THREE.Color("#5c5361"), 0.65) : color,
      roughness: 0.64,
      metalness: longship ? 0.02 : 0.2,
      emissive: ghost && !sunk ? skin.accent : "#000000",
      emissiveIntensity: ghost && !sunk ? 0.12 : 0,
    });
  const block = (size: [number, number, number], color: string, at: [number, number, number]) => {
    const part = roundedPart(size, finish(color), Math.min(...size) * 0.3);
    part.position.set(...at);
    group.add(part);
    return part;
  };
  const pole = (radius: number, height: number, color: string, at: [number, number, number]) => {
    const part = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 10),
      finish(color),
    );
    part.position.set(...at);
    group.add(part);
    return part;
  };
  block([width, 0.22, 0.47], skin.hull, [0, 0.12, 0]);
  block([Math.max(0.28, width - 0.13), 0.07, 0.35], skin.deck, [0, 0.27, 0]);
  if (longship || ghost || dragon) {
    const mastHeight = length === 1 ? 0.4 : 0.7;
    pole(0.022, mastHeight, skin.trim, [0, 0.3 + mastHeight / 2, 0]);
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(0.7, width * 0.65), mastHeight * 0.7),
      new THREE.MeshStandardMaterial({
        color: skin.accent,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    sail.position.set(0, 0.35 + mastHeight * 0.55, 0);
    sail.rotation.y = Math.PI / 2;
    group.add(sail);
    for (const side of [-1, 1]) {
      for (let j = 0; j < length; j++) {
        const shield = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.075, 0.035, 12),
          finish(skin.trim),
        );
        shield.rotation.x = Math.PI / 2;
        shield.position.set((j - (length - 1) / 2) * 0.55, 0.22, side * 0.24);
        group.add(shield);
      }
    }
    if (dragon || longship) {
      const neck = block([0.11, dragon ? 0.38 : 0.21, 0.13], skin.trim, [
        width / 2 - 0.05,
        0.35,
        0,
      ]);
      neck.rotation.z = -0.3;
      block([0.2, 0.12, 0.16], dragon ? skin.hull : skin.trim, [
        width / 2 + 0.035,
        dragon ? 0.56 : 0.42,
        0,
      ]);
      if (dragon) block([0.07, 0.04, 0.18], skin.accent, [width / 2 + 0.09, 0.59, 0]);
    }
  } else {
    block([Math.max(0.21, width * 0.28), 0.23, 0.29], skin.hull, [-width * 0.1, 0.42, 0]);
    block([Math.max(0.22, width * 0.3), 0.055, 0.32], skin.trim, [-width * 0.1, 0.57, 0]);
    for (const side of [-1, 1])
      block([Math.max(0.12, width * 0.2), 0.065, 0.02], skin.detail, [
        -width * 0.1,
        0.47,
        side * 0.155,
      ]);
    if (length > 1) {
      pole(0.045, 0.23, skin.detail, [-width * 0.13, 0.71, 0]);
      const turret = pole(0.1, 0.1, skin.hull, [width * 0.29, 0.37, 0]);
      const barrel = pole(0.027, 0.29, skin.trim, [width * 0.4, 0.42, 0]);
      barrel.rotation.z = Math.PI / 2;
      turret.castShadow = true;
    }
  }
  if (sunk) group.rotation.z = 0.08;
  group.traverse((part) => {
    if (part instanceof THREE.Mesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  return group;
}
