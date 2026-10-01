import * as THREE from "three";
import { getAvatar, type AvatarId } from "../../../../../shared/platform/avatars";
import { makeSeatedArm, roundedPart } from "./AvatarParts";
import { mergeRigidParts } from "./mergeRigidParts";

type Point = [number, number, number];

function material(color: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.42 : 0.8, metalness });
}

function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, color: number, at: Point) {
  const part = new THREE.Mesh(geometry, material(color));
  part.position.set(...at);
  part.castShadow = part.receiveShadow = true;
  parent.add(part);
  return part;
}

function sphere(parent: THREE.Group, size: Point, color: number, at: Point) {
  const part = mesh(parent, new THREE.SphereGeometry(1, 24, 16), color, at);
  part.scale.set(...size);
  return part;
}

function box(parent: THREE.Group, size: Point, color: number, at: Point, metalness = 0) {
  const part = roundedPart(size, material(color, metalness), Math.min(...size) * 0.22);
  part.position.set(...at);
  parent.add(part);
  return part;
}

function smile(parent: THREE.Group, color: number, y: number, z: number) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.05, y, z),
    new THREE.Vector3(0, y - 0.015, z + 0.01),
    new THREE.Vector3(0.05, y, z),
  ]);
  mesh(parent, new THREE.TubeGeometry(curve, 10, 0.006, 6, false), color, [0, 0, 0]);
}

/** All variants share the same head pivot and seated arm rig, including reactions. */
export function makeAvatarHead(avatarId: AvatarId) {
  const avatar = getAvatar(avatarId);
  const { id, skin, accent } = avatar;
  const head = new THREE.Group();
  head.name = "head";
  if (id === "robot") {
    box(head, [0.46, 0.46, 0.35], skin, [0, 0, 0], 0.55);
    box(head, [0.36, 0.24, 0.025], 0x243541, [0, 0.015, 0.184]);
    for (const side of [-1, 1]) {
      box(head, [0.063, 0.025, 0.02], accent, [side * 0.088, 0.043, 0.205]);
      box(head, [0.055, 0.15, 0.12], 0x627d91, [side * 0.255, 0, 0], 0.5);
    }
    for (const x of [-0.04, 0, 0.04]) box(head, [0.022, 0.012, 0.013], accent, [x, -0.068, 0.205]);
    mesh(head, new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10), skin, [0, 0.27, 0]);
    sphere(head, [0.035, 0.035, 0.035], accent, [0, 0.34, 0]);
    return head;
  }

  const human = id === "human" || id === "astronaut";
  const alien = id === "alien";
  sphere(
    head,
    human ? [0.24, 0.3, 0.222] : alien ? [0.255, 0.32, 0.23] : [0.265, 0.255, 0.225],
    skin,
    [0, 0, 0],
  );

  if (human) {
    sphere(head, [0.033, 0.053, 0.04], skin, [0, -0.02, 0.217]);
    for (const side of [-1, 1]) sphere(head, [0.037, 0.062, 0.04], skin, [side * 0.23, -0.013, 0]);
    const hairCap = mesh(
      head,
      new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      0x48322b,
      [0, 0.025, -0.013],
    );
    hairCap.scale.set(0.245, 0.292, 0.224);
    for (let i = 0; i < 4; i++)
      sphere(head, [0.064, 0.046, 0.074], 0x48322b, [-0.14 + i * 0.087, 0.259, 0.085]);
    smile(head, 0x975c4e, -0.13, 0.198);
  } else if (alien) {
    for (const side of [-1, 1]) {
      const eye = sphere(head, [0.061, 0.093, 0.024], accent, [side * 0.095, 0.025, 0.215]);
      eye.rotation.z = -side * 0.24;
      sphere(head, [0.012, 0.018, 0.005], 0xfff8e3, [side * 0.094 - 0.016, 0.051, 0.236]);
      const antenna = mesh(head, new THREE.CylinderGeometry(0.014, 0.018, 0.16, 10), skin, [
        side * 0.105,
        0.33,
        -0.045,
      ]);
      antenna.rotation.z = -side * 0.28;
      sphere(head, [0.036, 0.036, 0.036], 0xf2d58b, [side * 0.13, 0.417, -0.045]);
    }
    smile(head, accent, -0.14, 0.2);
  } else if (id === "monkey") {
    for (const side of [-1, 1]) {
      sphere(head, [0.11, 0.13, 0.065], skin, [side * 0.265, 0.025, -0.01]);
      sphere(head, [0.069, 0.089, 0.025], accent, [side * 0.28, 0.025, 0.048]);
      sphere(head, [0.112, 0.13, 0.034], accent, [side * 0.086, 0.04, 0.208]);
    }
    sphere(head, [0.145, 0.094, 0.065], accent, [0, -0.09, 0.208]);
    for (const side of [-1, 1])
      sphere(head, [0.009, 0.007, 0.006], 0x66402d, [side * 0.018, -0.049, 0.269]);
    for (const x of [-0.04, 0, 0.04])
      sphere(head, [0.047, 0.055, 0.045], skin, [x, 0.253 + (x === 0 ? 0.02 : 0), -0.01]);
    smile(head, 0x66402d, -0.128, 0.269);
  } else {
    for (const side of [-1, 1]) {
      if (id === "cat") {
        const shape = new THREE.Shape();
        shape.moveTo(-0.085, 0);
        shape.lineTo(0.085, 0);
        shape.lineTo(0, 0.2);
        shape.closePath();
        const ear = mesh(
          head,
          new THREE.ExtrudeGeometry(shape, {
            depth: 0.06,
            bevelEnabled: true,
            bevelSize: 0.018,
            bevelThickness: 0.012,
            bevelSegments: 2,
            steps: 1,
          }),
          skin,
          [side * 0.18, 0.18, -0.035],
        );
        ear.rotation.z = -side * 0.15;
        const inner = mesh(head, new THREE.ShapeGeometry(shape), accent, [
          side * 0.18,
          0.213,
          0.04,
        ]);
        inner.scale.set(0.58, 0.58, 1);
        inner.rotation.z = ear.rotation.z;
      } else if (id === "rabbit") {
        const ear = sphere(head, [0.065, 0.235, 0.065], skin, [side * 0.115, 0.38, -0.035]);
        ear.rotation.z = -side * 0.12;
        const inner = sphere(head, [0.033, 0.18, 0.014], accent, [side * 0.12, 0.4, 0.023]);
        inner.rotation.z = ear.rotation.z;
      } else if (id === "dog") {
        const ear = sphere(head, [0.085, 0.18, 0.066], accent, [side * 0.25, 0.046, -0.015]);
        ear.rotation.z = side * 0.17;
      } else {
        sphere(head, [0.096, 0.1, 0.066], id === "panda" ? accent : skin, [
          side * 0.21,
          0.215,
          -0.025,
        ]);
        sphere(head, [0.054, 0.056, 0.021], id === "panda" ? 0x74635b : accent, [
          side * 0.21,
          0.218,
          0.038,
        ]);
      }
      if (id === "panda") {
        const patch = sphere(head, [0.069, 0.077, 0.017], accent, [side * 0.095, 0.045, 0.208]);
        patch.rotation.z = side * 0.25;
      }
      sphere(
        head,
        [0.081, 0.058, 0.065],
        id === "cat" ? 0xe5e2d7 : id === "panda" ? skin : id === "rabbit" ? 0xf6ede6 : accent,
        [side * 0.065, -0.075, 0.208],
      );
    }
    sphere(
      head,
      [0.032, 0.023, 0.02],
      id === "rabbit" || id === "cat" ? 0xce879a : 0x302a29,
      [0, -0.045, 0.279],
    );
    smile(head, 0x55413a, -0.108, 0.255);
    if (id === "rabbit") box(head, [0.042, 0.04, 0.02], 0xfffcf0, [0, -0.127, 0.259]);
    if (id === "cat")
      for (const side of [-1, 1])
        for (const y of [-0.055, -0.085]) {
          const whisker = box(head, [0.085, 0.005, 0.006], 0xece6d6, [side * 0.18, y, 0.202]);
          whisker.rotation.z = side * (y === -0.055 ? 0.12 : -0.12);
        }
  }

  if (!alien)
    for (const side of [-1, 1]) {
      const z = id === "monkey" ? 0.249 : id === "panda" ? 0.228 : 0.212;
      sphere(head, [0.035, 0.028, 0.011], 0xfff8e6, [side * 0.095, 0.045, z]);
      sphere(head, [0.017, 0.02, 0.007], id === "cat" ? 0x687a44 : 0x514236, [
        side * 0.095,
        0.042,
        z + 0.01,
      ]);
      sphere(head, [0.008, 0.012, 0.004], 0x162524, [side * 0.095, 0.042, z + 0.016]);
      sphere(head, [0.004, 0.005, 0.002], 0xffffff, [side * 0.095 - 0.005, 0.05, z + 0.02]);
    }

  if (id === "astronaut") {
    mesh(
      head,
      new THREE.SphereGeometry(0.315, 28, 20, Math.PI, Math.PI),
      0xf0e7d5,
      [0, 0.02, -0.005],
    ).scale.y = 1.1;
    const rim = mesh(
      head,
      new THREE.TorusGeometry(0.276, 0.031, 10, 40),
      0xe7dbc2,
      [0, 0.018, 0.047],
    );
    rim.scale.y = 1.08;
    for (const side of [-1, 1]) {
      box(head, [0.075, 0.15, 0.15], accent, [side * 0.3, 0.02, -0.025]);
      box(head, [0.022, 0.077, 0.077], 0x516d85, [side * 0.341, 0.02, -0.01]);
    }
  }
  return head;
}

/** Used both at the game table and in the lobby preview. Coordinates match the table rig. */
export function makeSeatedAvatar(avatarId: AvatarId, holdingCards: boolean) {
  const avatar = getAvatar(avatarId);
  const body = new THREE.Group();
  body.position.y = 0.92;
  const model = new THREE.Group();
  model.position.y = -0.92;
  body.add(model);
  const mechanical = avatar.id === "robot";
  const space = avatar.id === "astronaut";
  const jacket = material(avatar.outfit, mechanical ? 0.4 : 0);
  const trousers = space ? 0xdbd2c0 : mechanical ? 0x526f82 : 0x29333b;
  for (const side of [-1, 1]) {
    sphere(model, [0.17, 0.16, 0.4], trousers, [side * 0.21, 0.92, 0.28]);
    box(model, [0.23, 0.64, 0.22], trousers, [side * 0.21, 0.54, 0.56]);
    sphere(model, [0.17, 0.095, 0.31], space ? 0xc4c7c2 : 0x302a2d, [side * 0.21, 0.18, 0.65]);
    box(model, [0.23, 0.025, 0.5], 0x1e2226, [side * 0.21, 0.12, 0.68]);
  }
  const profile = [
    [0, 0],
    [0.25, 0],
    [0.3, 0.08],
    [0.32, 0.35],
    [0.35, 0.67],
    [0.32, 0.79],
    [0.2, 0.86],
    [0, 0.86],
  ];
  const torso = new THREE.Mesh(
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ),
    jacket,
  );
  torso.position.y = 0.99;
  torso.scale.z = 0.68;
  torso.castShadow = torso.receiveShadow = true;
  model.add(torso);
  if (mechanical || space) {
    box(model, [0.29, 0.32, 0.035], mechanical ? 0x273f50 : 0x516d85, [0, 1.57, 0.257]);
    for (const side of [-1, 1])
      box(model, [0.052, 0.026, 0.025], avatar.accent, [side * 0.067, 1.62, 0.287]);
    box(model, [0.19, 0.034, 0.02], avatar.accent, [0, 1.51, 0.288]);
    box(model, [0.12, 0.1, 0.04], avatar.accent, [-0.23, 1.75, 0.204]);
  } else {
    box(model, [0.17, 0.47, 0.025], 0xf1e7d1, [0, 1.6, 0.249]);
    for (const side of [-1, 1]) {
      const lapel = roundedPart([0.095, 0.39, 0.025], jacket, 0.012);
      lapel.position.set(side * 0.135, 1.65, 0.255);
      lapel.rotation.z = -side * 0.31;
      model.add(lapel);
    }
    box(model, [0.048, 0.24, 0.026], avatar.accent, [0, 1.68, 0.277]);
    sphere(model, [0.035, 0.035, 0.019], avatar.accent, [0, 1.83, 0.278]);
    for (const y of [1.23, 1.39]) sphere(model, [0.018, 0.018, 0.01], 0xc5a96c, [0, y, 0.275]);
  }
  mesh(model, new THREE.CylinderGeometry(0.105, 0.105, 0.18, 18), avatar.skin, [0, 1.94, 0.02]);
  const head = makeAvatarHead(avatar.id);
  head.position.set(0, 2.25, 0.025);
  model.add(head);
  const leftArm = makeSeatedArm(avatar.skin, jacket, -1, holdingCards);
  const rightArm = makeSeatedArm(avatar.skin, jacket, 1, false);
  model.add(leftArm.root, rightArm.root);
  const hand = new THREE.Group();
  hand.name = "hand";
  leftArm.grip.add(hand);
  mergeRigidParts(head);
  mergeRigidParts(model);
  return { body, head, leftArm, rightArm, hand };
}
