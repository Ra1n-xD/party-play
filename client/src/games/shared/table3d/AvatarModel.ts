import * as THREE from "three";
import { getAvatar, type AvatarId } from "../../../../../shared/platform/avatars";
import { makeAvatarFace, type AvatarFaceRig } from "./AvatarFace";
import { makeSeatedArm, roundedPart } from "./AvatarParts";
import { mergeRigidParts } from "./mergeRigidParts";
import { faceSurfaceDepth } from "./AvatarSculpt";

type Point = [number, number, number];
const faces = new WeakMap<THREE.Group, AvatarFaceRig>();
const gaussian = (value: number, width: number) => Math.exp(-Math.pow(value / width, 2));

function material(color: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.36 : 0.82, metalness });
}

function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, color: number, at: Point) {
  const part = new THREE.Mesh(geometry, material(color));
  part.position.set(...at);
  part.castShadow = part.receiveShadow = true;
  parent.add(part);
  return part;
}

function oval(parent: THREE.Group, size: Point, color: number, at: Point) {
  const part = mesh(parent, new THREE.SphereGeometry(1, 24, 18), color, at);
  part.scale.set(...size);
  return part;
}

function box(parent: THREE.Group, size: Point, color: number, at: Point, metalness = 0) {
  const part = roundedPart(size, material(color, metalness), Math.min(...size) * 0.28);
  part.position.set(...at);
  parent.add(part);
  return part;
}

function seam(parent: THREE.Group, points: Point[], color: number, thickness = 0.003) {
  return mesh(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))),
      24,
      thickness,
      5,
      false,
    ),
    color,
    [0, 0, 0],
  );
}

/** A single continuous surface carries the cheeks, brow ridge, nose, muzzle and chin. */
function sculptedHead(avatarId: AvatarId) {
  const avatar = getAvatar(avatarId);
  const human = avatarId === "human" || avatarId === "astronaut";
  const alien = avatarId === "alien";
  const monkey = avatarId === "monkey";
  const geometry = new THREE.SphereGeometry(1, 48, 40);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const smile = new Float32Array(positions.count * 3);
  const jaw = new Float32Array(positions.count * 3);
  const base = new THREE.Color(avatar.skin);
  const muzzleColor = new THREE.Color(
    monkey
      ? avatar.accent
      : avatarId === "cat"
        ? 0xd8ddd4
        : avatarId === "rabbit"
          ? 0xf5e6e2
          : avatarId === "dog" || avatarId === "bear"
            ? avatar.accent
            : avatar.skin,
  );
  const accent = new THREE.Color(avatar.accent);
  const tint = new THREE.Color();
  const blush = new THREE.Color(human ? 0xd58f77 : avatar.skin);
  for (let i = 0; i < positions.count; i++) {
    const nx = positions.getX(i);
    const ny = positions.getY(i);
    const nz = positions.getZ(i);
    const lower = Math.max(0, -ny);
    let x =
      nx *
      (human ? 0.242 : alien ? 0.265 : 0.265) *
      (1 - lower * (human ? 0.2 : alien ? 0.36 : 0.06));
    const y = ny * (human ? 0.3 : alien ? 0.326 : 0.266);
    const front = THREE.MathUtils.smoothstep(nz, 0, 0.55);
    const z = nz > 0 ? faceSurfaceDepth(avatarId, x, y) : nz * (human ? 0.225 : 0.234);
    const cheeks = gaussian(Math.abs(x) - 0.11, 0.07) * gaussian(y + 0.045, 0.07);
    positions.setXYZ(i, x, y, z);
    const muzzle = front * gaussian(x, 0.148) * gaussian(y + 0.096, 0.116);
    const faceMask = monkey
      ? Math.max(muzzle, front * gaussian(Math.abs(x) - 0.087, 0.091) * gaussian(y - 0.035, 0.123))
      : muzzle;
    tint.copy(base).lerp(muzzleColor, THREE.MathUtils.smoothstep(faceMask, 0.26, 0.68));
    if (avatarId === "panda") {
      const patch =
        front *
        gaussian(Math.abs(x) - 0.103, 0.064) *
        gaussian(y - 0.045 + (Math.abs(x) - 0.103) * 0.45, 0.082);
      tint.lerp(accent, THREE.MathUtils.smoothstep(patch, 0.3, 0.66));
    }
    if (human) tint.lerp(blush, cheeks * front * 0.26);
    colors.set([tint.r, tint.g, tint.b], i * 3);
    const smileWeight = front * gaussian(Math.abs(x) - 0.073, 0.075) * gaussian(y + 0.105, 0.095);
    const jawWeight = front * THREE.MathUtils.smoothstep(-y, 0.03, 0.24) * gaussian(x, 0.19);
    smile.set(
      [x + Math.sign(x) * smileWeight * 0.006, y + smileWeight * 0.01, z + cheeks * front * 0.004],
      i * 3,
    );
    jaw.set([x, y - jawWeight * 0.034, z + jawWeight * 0.005], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.morphAttributes.position = [
    new THREE.BufferAttribute(smile, 3),
    new THREE.BufferAttribute(jaw, 3),
  ];
  geometry.computeVertexNormals();
  const skin = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.76 }),
  );
  skin.name = "sculpted-face";
  skin.castShadow = skin.receiveShadow = true;
  return skin;
}

/** Smooth tapered ear with a cupped front; its wide root is buried in the cranium. */
function ear(
  parent: THREE.Group,
  skin: number,
  inner: number,
  side: number,
  kind: "cat" | "rabbit" | "round" | "dog" | "human",
) {
  const shape = new THREE.SphereGeometry(1, 24, 24);
  const position = shape.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const taper = kind === "cat" ? 1 - Math.max(0, y) * 0.66 : 1;
    position.setXYZ(i, position.getX(i) * taper, y, position.getZ(i));
  }
  shape.computeVertexNormals();
  const group = new THREE.Group();
  const outer = mesh(group, shape, skin, [0, 0, 0]);
  const lining = oval(group, [0.58, 0.72, 0.12], inner, [0, 0.015, 0.81]);
  lining.rotation.x = -0.12;
  if (kind === "cat") {
    group.position.set(side * 0.181, 0.231, -0.03);
    group.scale.set(0.09, 0.17, 0.053);
    group.rotation.z = -side * 0.22;
  } else if (kind === "rabbit") {
    group.position.set(side * 0.113, 0.379, -0.038);
    group.scale.set(0.061, 0.228, 0.057);
    group.rotation.z = -side * 0.15;
  } else if (kind === "dog") {
    group.position.set(side * 0.251, 0.041, -0.013);
    group.scale.set(0.08, 0.181, 0.055);
    group.rotation.z = side * 0.16;
  } else if (kind === "human") {
    group.position.set(side * 0.229, -0.012, 0.005);
    group.scale.set(0.035, 0.061, 0.031);
    group.rotation.y = side * 0.34;
  } else {
    group.position.set(side * 0.213, 0.211, -0.032);
    group.scale.set(0.091, 0.094, 0.058);
  }
  outer.material.roughness = 0.86;
  parent.add(group);
  mergeRigidParts(group);
  return group;
}

function hair(parent: THREE.Group) {
  const geometry = new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const originalY = positions.getY(i);
    const ring = Math.sqrt(Math.max(0, 1 - originalY * originalY));
    const dx = ring > 0.0001 ? positions.getX(i) / ring : 0;
    const dz = ring > 0.0001 ? positions.getZ(i) / ring : 0;
    const front = Math.max(0, dz);
    const hairline = THREE.MathUtils.lerp(
      -0.057,
      0.18 + gaussian(dx + 0.25, 0.45) * 0.018 - Math.max(0, dx) * 0.032,
      THREE.MathUtils.smoothstep(front, 0.35, 0.75),
    );
    const y = hairline + (0.318 - hairline) * originalY;
    const radius = Math.sqrt(Math.max(0, 1 - ((y - 0.01) / 0.308) ** 2));
    const x = dx * 0.25 * radius;
    const z = dz * 0.239 * radius - 0.009;
    positions.setXYZ(i, x, y, dz > 0 ? Math.max(z, faceSurfaceDepth("human", x, y) + 0.004) : z);
  }
  geometry.computeVertexNormals();
  mesh(parent, geometry, 0x48322b, [0, 0, 0]);
}

/** All ten public cosmetics share a sculpted head and the same expressive facial controls. */
export function makeAvatarHead(avatarId: AvatarId) {
  const { id, skin, accent } = getAvatar(avatarId);
  const head = new THREE.Group();
  head.name = "head";
  let skinMesh: THREE.Mesh;
  if (id === "robot") {
    skinMesh = box(head, [0.46, 0.45, 0.35], skin, [0, 0, 0], 0.58);
    box(head, [0.365, 0.26, 0.038], 0x203744, [0, 0.014, 0.178], 0.35);
    for (const side of [-1, 1]) {
      box(head, [0.06, 0.158, 0.118], 0x607c8e, [side * 0.255, 0, -0.007], 0.55);
      seam(
        head,
        [
          [side * 0.176, -0.161, 0.169],
          [side * 0.12, -0.182, 0.18],
          [side * 0.042, -0.183, 0.18],
        ],
        0x627d8d,
        0.006,
      );
    }
    mesh(head, new THREE.CylinderGeometry(0.009, 0.014, 0.087, 12), skin, [0, 0.262, -0.024]);
    oval(head, [0.026, 0.026, 0.026], accent, [0, 0.316, -0.024]);
  } else {
    skinMesh = sculptedHead(id);
    head.add(skinMesh);
    const human = id === "human" || id === "astronaut";
    if (human) {
      for (const side of [-1, 1]) {
        ear(head, skin, 0xbf8972, side, "human");
        oval(head, [0.008, 0.004, 0.003], 0x96624f, [side * 0.019, -0.045, 0.271]);
      }
      hair(head);
    } else if (id === "alien") {
      for (const side of [-1, 1]) {
        seam(
          head,
          [
            [side * 0.105, 0.276, -0.06],
            [side * 0.112, 0.354, -0.058],
            [side * 0.139, 0.411, -0.043],
          ],
          skin,
          0.013,
        );
        oval(head, [0.027, 0.033, 0.026], 0xe4ca8b, [side * 0.14, 0.418, -0.043]);
      }
    } else {
      for (const side of [-1, 1]) {
        const kind = id === "cat" || id === "rabbit" || id === "dog" ? id : "round";
        const earPart = ear(
          head,
          id === "panda" || id === "dog" ? accent : skin,
          id === "panda" ? 0x655b53 : accent,
          side,
          kind,
        );
        if (id === "monkey") {
          earPart.position.set(side * 0.262, 0.025, -0.017);
          earPart.scale.set(0.1, 0.118, 0.055);
        }
      }
      if (id === "monkey") {
        for (const side of [-1, 1])
          oval(head, [0.008, 0.005, 0.003], 0x6c4835, [side * 0.017, -0.047, 0.293]);
      } else {
        const nose = oval(
          head,
          [0.034, 0.023, 0.021],
          id === "cat" || id === "rabbit" ? 0xc78f97 : 0x352d2b,
          [0, -0.05, 0.298],
        );
        const positions = nose.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++)
          positions.setX(i, positions.getX(i) * (0.84 + positions.getY(i) * 0.2));
        nose.geometry.computeVertexNormals();
        if (id === "cat")
          for (const side of [-1, 1])
            for (let i = 0; i < 3; i++)
              seam(
                head,
                [
                  [side * 0.106, -0.073 - i * 0.014, 0.266],
                  [side * 0.166, -0.068 - i * 0.019, 0.246],
                  [side * 0.221, -0.06 - i * 0.024, 0.226],
                ],
                0xdce3d9,
                0.0017,
              );
      }
    }
  }
  faces.set(head, makeAvatarFace(id, head, skinMesh));
  if (id === "astronaut") {
    mesh(
      head,
      new THREE.SphereGeometry(0.313, 32, 24, Math.PI, Math.PI),
      0xece6d9,
      [0, 0.018, -0.014],
    ).scale.y = 1.1;
    const rim = mesh(
      head,
      new THREE.TorusGeometry(0.277, 0.024, 10, 48),
      0xd6c9af,
      [0, 0.019, 0.048],
    );
    rim.scale.y = 1.09;
    for (const side of [-1, 1]) {
      box(head, [0.07, 0.15, 0.143], accent, [side * 0.3, 0.023, -0.03]);
      box(head, [0.02, 0.073, 0.073], 0x516d85, [side * 0.337, 0.022, -0.014]);
    }
  }
  return head;
}

function tailoredTorso(jacket: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(
    [
      [0, 0, 0],
      [0.265, 0.006, 0],
      [0.294, 0.105, 0],
      [0.277, 0.3, 0],
      [0.313, 0.565, 0],
      [0.345, 0.708, 0],
      [0.326, 0.79, 0],
      [0.223, 0.845, 0],
      [0.115, 0.869, 0],
      [0.105, 0.889, 0],
    ].map((point) => new THREE.Vector3(...(point as Point))),
  );
  const torso = new THREE.Mesh(
    new THREE.LatheGeometry(
      curve.getPoints(56).map((point) => new THREE.Vector2(Math.max(0, point.x), point.y)),
      32,
    ),
    jacket,
  );
  torso.position.y = 0.99;
  torso.scale.z = 0.69;
  torso.castShadow = torso.receiveShadow = true;
  return torso;
}

function fabricPanel(parent: THREE.Group, points: [number, number][], color: number, z: number) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  return mesh(
    parent,
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.009,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.003,
      bevelSegments: 2,
      steps: 1,
    }),
    color,
    [0, 0, z],
  );
}

/** Used at the table and in the lobby; seating and hand-card anchors stay unchanged. */
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
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.2, 0.965, 0.015),
      new THREE.Vector3(side * 0.209, 0.937, 0.305),
      new THREE.Vector3(side * 0.211, 0.81, 0.534),
      new THREE.Vector3(side * 0.21, 0.5, 0.563),
      new THREE.Vector3(side * 0.21, 0.213, 0.567),
    ]);
    const legGeometry = new THREE.TubeGeometry(curve, 32, 1, 16, false);
    const position = legGeometry.getAttribute("position");
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
    legGeometry.computeVertexNormals();
    mesh(model, legGeometry, trousers, [0, 0, 0]);
    const shoe = oval(model, [0.143, 0.082, 0.24], space ? 0xb8bebb : 0x342e31, [
      side * 0.21,
      0.172,
      0.679,
    ]);
    shoe.rotation.x = -0.045;
    box(model, [0.276, 0.032, 0.443], 0x202329, [side * 0.21, 0.105, 0.694]);
    seam(
      model,
      [
        [side * 0.21 - 0.093, 0.204, 0.785],
        [side * 0.21, 0.228, 0.819],
        [side * 0.21 + 0.093, 0.204, 0.785],
      ],
      space ? 0x8b9695 : 0x55484b,
      0.003,
    );
  }
  model.add(tailoredTorso(jacket));
  if (mechanical || space) {
    box(model, [0.269, 0.299, 0.033], mechanical ? 0x273f50 : 0x516d85, [0, 1.566, 0.221]);
    for (const side of [-1, 1])
      box(model, [0.046, 0.025, 0.013], avatar.accent, [side * 0.062, 1.621, 0.245]);
    box(model, [0.171, 0.023, 0.014], avatar.accent, [0, 1.518, 0.245]);
    box(model, [0.095, 0.07, 0.023], avatar.accent, [-0.224, 1.732, 0.159]);
    for (const side of [-1, 1])
      seam(
        model,
        [
          [side * 0.23, 1.159, 0.118],
          [side * 0.261, 1.44, 0.138],
          [side * 0.278, 1.7, 0.131],
        ],
        space ? 0xc0b6a4 : 0x74929d,
        0.008,
      );
  } else {
    fabricPanel(
      model,
      [
        [-0.117, 1.807],
        [0, 1.84],
        [0.117, 1.807],
        [0.055, 1.382],
        [-0.055, 1.382],
      ],
      0xf1e7d4,
      0.217,
    );
    for (const side of [-1, 1]) {
      fabricPanel(
        model,
        [
          [side * 0.111, 1.825],
          [side * 0.232, 1.753],
          [side * 0.159, 1.674],
          [side * 0.197, 1.646],
          [side * 0.026, 1.367],
        ],
        avatar.outfit,
        0.236,
      );
      fabricPanel(
        model,
        [
          [side * 0.007, 1.797],
          [side * 0.098, 1.851],
          [side * 0.116, 1.803],
          [side * 0.052, 1.725],
        ],
        0xfff2de,
        0.249,
      );
      seam(
        model,
        [
          [side * 0.113, 1.808, 0.252],
          [side * 0.142, 1.687, 0.252],
          [side * 0.034, 1.401, 0.252],
        ],
        new THREE.Color(avatar.outfit).multiplyScalar(0.73).getHex(),
        0.0025,
      );
      seam(
        model,
        [
          [side * 0.109, 1.292, 0.194],
          [side * 0.221, 1.301, 0.17],
        ],
        0x423f4b,
        0.004,
      );
    }
    fabricPanel(
      model,
      [
        [-0.025, 1.757],
        [0.025, 1.757],
        [0.034, 1.502],
        [0, 1.467],
        [-0.034, 1.502],
      ],
      avatar.accent,
      0.252,
    );
    box(model, [0.048, 0.048, 0.024], avatar.accent, [0, 1.775, 0.259]).rotation.z = Math.PI / 4;
    for (const y of [1.23, 1.385])
      oval(model, [0.013, 0.013, 0.006], 0xc8b08b, [0.029, y, y > 1.3 ? 0.221 : 0.209]);
    seam(
      model,
      [
        [-0.22, 1.673, 0.174],
        [-0.157, 1.679, 0.213],
      ],
      0xe4d7ca,
      0.007,
    );
  }
  const neck = mesh(
    model,
    new THREE.CapsuleGeometry(0.102, 0.141, 6, 20),
    avatar.skin,
    [0, 1.947, 0.02],
  );
  neck.scale.z = 0.88;
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
  return { body, head, face: faces.get(head)!, leftArm, rightArm, hand };
}
