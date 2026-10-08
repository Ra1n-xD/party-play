import * as THREE from "three";
import { type PetSpecies } from "../../../../../shared/platform/pet";
import { PetBehavior } from "./PetBehavior";

interface PetPalette {
  coat: string;
  accent: string;
  cream: string;
  blush: string;
}

const palettes: Record<PetSpecies, PetPalette> = {
  dragon: { coat: "#72bda2", accent: "#347e76", cream: "#eee4b7", blush: "#ca9f90" },
  cat: { coat: "#a797d6", accent: "#756392", cream: "#f4e7ee", blush: "#d89aae" },
  fox: { coat: "#d98558", accent: "#493936", cream: "#fff0d8", blush: "#d89a86" },
  rabbit: { coat: "#eee8dd", accent: "#ae968a", cream: "#fff6eb", blush: "#dea9af" },
  owl: { coat: "#bc9061", accent: "#70513e", cream: "#f6e8c5", blush: "#daa784" },
  dog: {
    coat: "#a2a5a6",
    accent: "#343136",
    cream: "#f7eddb",
    blush: "#d7a370",
  },
};

/** Smooth, tapered anatomy with a continuous surface, including two-tone tail tips. */
function curvedGeometry(
  points: readonly number[][],
  radii: readonly number[],
  radialSegments = 12,
  split = 1,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const segments = 28;
  const frames = curve.computeFrenetFrames(segments, false);
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const ring = radialSegments + 1;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPoint(t);
    const interval = t * (radii.length - 1);
    const lower = Math.min(radii.length - 2, Math.floor(interval));
    const radius = THREE.MathUtils.lerp(radii[lower], radii[lower + 1], interval - lower);
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const normal = frames.normals[i].clone().multiplyScalar(-Math.cos(angle));
      normal.addScaledVector(frames.binormals[i], Math.sin(angle));
      vertices.push(
        center.x + normal.x * radius,
        center.y + normal.y * radius,
        center.z + normal.z * radius,
      );
      uv.push(j / radialSegments, t);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ring + j;
      const b = a + ring;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const splitCount = Math.floor(segments * split) * radialSegments * 6;
  geometry.addGroup(0, splitCount, 0);
  if (splitCount < indices.length) geometry.addGroup(splitCount, indices.length - splitCount, 1);
  return geometry;
}

function roundedShape(shape: THREE.Shape, depth = 0.055, bevel = 0.018) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function earShape(width: number, height: number, bend = 0): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-width, 0);
  shape.bezierCurveTo(-width * 0.8, height * 0.35, bend - width * 0.34, height, bend, height);
  shape.bezierCurveTo(bend + width * 0.34, height, width * 0.8, height * 0.35, width, 0);
  shape.quadraticCurveTo(0, -height * 0.12, -width, 0);
  return shape;
}

interface EarVolume {
  width: number;
  height: number;
  bend: number;
  depth: number;
  oval?: boolean;
}

function earProfile(t: number, volume: EarVolume) {
  const sine = Math.max(0, Math.sin(Math.PI * t));
  const width = volume.oval
    ? (Math.pow(sine, 0.58) * (1 - 0.14 * t)) / 0.94
    : (Math.pow(sine, 0.48) * (1 - 0.7 * t)) / 0.7;
  const depth = (Math.pow(sine, 0.62) * (1 - 0.32 * t)) / 0.86;
  return {
    x: volume.bend * t * t,
    radiusX: Math.max(0.0001, volume.width * width),
    radiusZ: Math.max(0.0001, volume.depth * depth),
  };
}

/** A convex ear has a rounded side silhouette as well as a tapered front silhouette. */
function earVolumeGeometry(volume: EarVolume) {
  const segments = 28;
  const radialSegments = 24;
  const vertices: number[] = [];
  const indices: number[] = [];
  const ring = radialSegments + 1;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const profile = earProfile(t, volume);
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      vertices.push(
        profile.x + Math.cos(angle) * profile.radiusX,
        t * (volume.height + 0.03) - 0.03,
        Math.sin(angle) * profile.radiusZ,
      );
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ring + j;
      const b = a + ring;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function earInsertGeometry(shape: THREE.Shape, volume: EarVolume, y: number, offset: number) {
  const geometry = roundedShape(shape, 0.012, 0.008);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const t = THREE.MathUtils.clamp((vertices.getY(i) + y + 0.03) / (volume.height + 0.03), 0, 1);
    const profile = earProfile(t, volume);
    const across = (vertices.getX(i) - profile.x) / profile.radiusX;
    const surface = profile.radiusZ * Math.sqrt(Math.max(0, 1 - across * across));
    vertices.setZ(i, surface + offset + vertices.getZ(i) * 0.35);
  }
  geometry.computeVertexNormals();
  return geometry;
}

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
  private readonly eyes: { mesh: THREE.Mesh; height: number }[] = [];
  private readonly eyeLights: THREE.Mesh[] = [];
  private readonly sparks: THREE.Mesh[] = [];
  private readonly behavior: PetBehavior;
  private readonly bodyScale: number;
  private readonly headRestPosition = new THREE.Vector3(0, 0.68, 0);
  private readonly headRestScale = new THREE.Vector3(1, 1, 1);
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
    const palette = palettes[species];
    const satin = (color: string, roughness = 0.72) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    const coat = satin(palette.coat);
    const accent = satin(palette.accent);
    const cream = satin(palette.cream, 0.8);
    const pink = satin(palette.blush);
    const gold = satin("#dca452");
    const eyeMaterial = satin("#20303d", 0.2);
    const iris = satin(
      species === "dog" ? "#965e35" : species === "owl" ? "#a77b43" : "#506b7a",
      0.3,
    );
    const pupil = satin("#17212c", 0.15);
    const eyeWhite = new THREE.MeshBasicMaterial({ color: "#fff8e8" });
    // Geometry belongs to this rig: page and table instances can be disposed independently.
    const sphere = new THREE.SphereGeometry(1, 28, 20);
    const addMesh = (
      parent: THREE.Group | THREE.Mesh,
      geometry: THREE.BufferGeometry,
      material: THREE.Material | THREE.Material[],
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const ball = (
      parent: THREE.Group | THREE.Mesh,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy = sx,
      sz = sx,
    ) => {
      const mesh = addMesh(parent, sphere, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      return mesh;
    };
    const curve = (
      parent: THREE.Group,
      material: THREE.Material | THREE.Material[],
      points: readonly number[][],
      radii: readonly number[],
      split = 1,
      radialSegments = 12,
    ) => addMesh(parent, curvedGeometry(points, radii, radialSegments, split), material);
    const shapeMesh = (
      parent: THREE.Group,
      material: THREE.Material,
      shape: THREE.Shape,
      x: number,
      y: number,
      z: number,
      depth = 0.055,
      bevel = 0.018,
    ) => {
      const mesh = addMesh(parent, roundedShape(shape, depth, bevel), material);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const softEar = (parent: THREE.Group, material: THREE.Material, volume: EarVolume) =>
      addMesh(parent, earVolumeGeometry(volume), material);
    const earInsert = (
      parent: THREE.Group,
      material: THREE.Material,
      shape: THREE.Shape,
      volume: EarVolume,
      y: number,
      offset = 0.006,
    ) => {
      const mesh = addMesh(parent, earInsertGeometry(shape, volume, y, offset), material);
      mesh.position.y = y;
      return mesh;
    };
    const makeEye = (x: number, y: number, z: number, width: number, height: number) => {
      const eye = ball(this.head, eyeMaterial, x, y, z, width, height, 0.035);
      this.eyes.push({ mesh: eye, height });
      this.eyeLights.push(ball(eye, iris, 0, -0.13, 0.73, 0.72, 0.75, 0.3));
      this.eyeLights.push(ball(eye, pupil, 0, 0.01, 0.95, 0.53, 0.65, 0.13));
      this.eyeLights.push(ball(eye, eyeWhite, -0.29, 0.38, 1.035, 0.21, 0.17, 0.13));
      this.eyeLights.push(ball(eye, eyeWhite, 0.32, -0.25, 1.06, 0.095, 0.075, 0.06));
    };
    const smile = (x: number, y: number, z: number, width = 0.05) => {
      curve(
        this.head,
        accent,
        [
          [x - width, y + 0.014, z],
          [x - width * 0.5, y - 0.009, z + 0.007],
          [x, y, z],
        ],
        [0.004, 0.005, 0.004],
      );
      curve(
        this.head,
        accent,
        [
          [x, y, z],
          [x + width * 0.5, y - 0.009, z + 0.007],
          [x + width, y + 0.014, z],
        ],
        [0.004, 0.005, 0.004],
      );
    };
    const details = stage >= 2;
    const adult = stage === 3;
    this.root.name = `pet-${species}`;
    this.root.add(this.pose);
    if (stage === 0) {
      const profile = [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(0.15, 0.035),
        new THREE.Vector2(0.255, 0.15),
        new THREE.Vector2(0.28, 0.31),
        new THREE.Vector2(0.25, 0.48),
        new THREE.Vector2(0.17, 0.63),
        new THREE.Vector2(0.001, 0.72),
      ];
      const outline = new THREE.SplineCurve(profile).getPoints(48);
      outline.forEach((point) => (point.x = Math.max(0.001, point.x)));
      addMesh(this.pose, new THREE.LatheGeometry(outline, 40), cream);
      const speckles = [
        [-0.13, 0.23, 0.224, 0.039, 0.065],
        [0.09, 0.43, 0.235, 0.065, 0.046],
        [-0.06, 0.58, 0.177, 0.035, 0.047],
        [0.16, 0.18, 0.184, 0.037, 0.029],
        [-0.21, 0.4, 0.14, 0.027, 0.035],
        [0.22, 0.34, 0.15, 0.023, 0.034],
      ];
      for (const [x, y, z, sx, sy] of speckles) ball(this.pose, coat, x, y, z, sx, sy, 0.012);
      ball(this.pose, gold, 0.04, 0.3, 0.27, 0.017, 0.021, 0.009);
    } else {
      this.pose.scale.setScalar(this.bodyScale);
      const isOwl = species === "owl";
      // Mature pets grow a torso and limbs, rather than only scaling up the juvenile rig.
      // Keep the head's rest transform so every animation preserves these proportions.
      const torso = new THREE.Group();
      this.pose.add(torso);
      if (adult) {
        torso.scale.set(species === "owl" || species === "dragon" ? 1.12 : 1, 1.34, 1.06);
        this.headRestPosition.y = species === "rabbit" ? 0.84 : 0.9;
        this.headRestScale.set(
          isOwl ? 0.98 : species === "fox" || species === "dragon" ? 0.94 : 0.9,
          species === "fox" ? 0.84 : 0.89,
          species === "fox" || species === "dog" || species === "dragon" ? 1.04 : 0.94,
        );
      }
      if (species === "dog") {
        // The adult has a broad chest and raised shoulders; juveniles keep a larger head/body ratio.
        torso.scale.set(adult ? 1.25 : 1.03, adult ? 1.38 : 1, adult ? 1.18 : 1.03);
        this.headRestPosition.y = adult ? 0.99 : 0.68;
        this.headRestScale.set(adult ? 0.97 : 1.03, adult ? 0.9 : 0.94, adult ? 1.07 : 1);
      }
      const bodyWidth = isOwl ? 0.33 : species === "rabbit" ? 0.285 : 0.295;
      const body = ball(torso, coat, 0, 0.32, 0, bodyWidth, 0.32, 0.25);
      if (species === "dog") {
        // A deterministic mottled coat stays identical through growth and reconnects.
        body.geometry = new THREE.SphereGeometry(1, 64, 48);
        const positions = body.geometry.attributes.position;
        const colors: number[] = [];
        const lightCoat = new THREE.Color("#e6e4dc");
        const darkCoat = new THREE.Color("#667176");
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i),
            y = positions.getY(i),
            z = positions.getZ(i);
          const pattern =
            Math.sin(x * 8 + y * 5 + z * 6 + Math.sin(z * 11)) * Math.cos(y * 12 - z * 9) +
            0.4 * Math.sin(x * 21 - z * 14) * Math.cos(y * 22 + x * 5);
          const color = lightCoat
            .clone()
            .lerp(darkCoat, THREE.MathUtils.smoothstep(pattern, -0.35, 0.6));
          colors.push(color.r, color.g, color.b);
        }
        body.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        const merle = satin("#ffffff", 0.88);
        merle.vertexColors = true;
        body.material = merle;
      }
      if (species !== "dog") ball(torso, cream, 0, 0.29, 0.225, isOwl ? 0.22 : 0.19, 0.225, 0.044);
      this.head.position.copy(this.headRestPosition);
      this.head.scale.copy(this.headRestScale);
      this.pose.add(this.head);
      const headWidth =
        species === "dog"
          ? stage === 1
            ? 0.38
            : 0.365
          : stage === 1
            ? 0.365
            : species === "fox"
              ? 0.345
              : 0.35;
      const headDepth = species === "dog" ? 0.305 : species === "dragon" ? 0.27 : 0.285;
      const skull = ball(
        this.head,
        species === "dog" ? accent : coat,
        0,
        0.015,
        0.025,
        headWidth,
        species === "dog" ? 0.335 : stage === 1 ? 0.31 : 0.285,
        headDepth,
      );
      if (species === "dog") {
        // The photo-inspired tan mask follows a rounded skull, with gentle brow patches.
        skull.geometry = new THREE.SphereGeometry(1, 56, 36);
        const vertices = skull.geometry.attributes.position;
        const colors: number[] = [];
        const dark = new THREE.Color(palette.accent);
        const tan = new THREE.Color(palette.blush);
        for (let i = 0; i < vertices.count; i++) {
          const x = vertices.getX(i),
            y = vertices.getY(i),
            z = vertices.getZ(i);
          const cheek =
            THREE.MathUtils.smoothstep(Math.abs(x), 0.12, 0.38) *
            (1 - THREE.MathUtils.smoothstep(y, 0.03, 0.3));
          const browDistance =
            Math.pow((Math.abs(x) - 0.39) / 0.28, 2) + Math.pow((y - 0.46) / 0.19, 2);
          const brow = 1 - THREE.MathUtils.smoothstep(browDistance, 0.5, 1.25);
          const front = THREE.MathUtils.smoothstep(z, 0.1, 0.55);
          const color = dark.clone().lerp(tan, Math.max(cheek, brow) * front);
          colors.push(color.r, color.g, color.b);
          vertices.setX(i, x * (0.96 + 0.04 * THREE.MathUtils.smoothstep(y, -0.9, 0.1)));
        }
        skull.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        skull.geometry.computeVertexNormals();
        const faceCoat = satin("#ffffff", 0.87);
        faceCoat.vertexColors = true;
        skull.material = faceCoat;
        for (const sign of [-1, 1]) {
          const haunch = ball(torso, coat, sign * 0.205, 0.18, -0.055, 0.15, 0.18, 0.185);
          haunch.geometry = body.geometry;
          haunch.material = body.material;
        }
      }
      for (const sign of [-1, 1]) {
        const foot = new THREE.Group();
        foot.position.set(sign * 0.17, 0.075, 0.16);
        if (species === "dog") foot.position.set(sign * (adult ? 0.295 : 0.24), 0.055, -0.005);
        this.pose.add(foot);
        this.feet.push(foot);
        if (adult) foot.scale.set(species === "rabbit" ? 1.22 : 1.08, 1, 1.14);
        if (species === "dog") foot.scale.multiply(new THREE.Vector3(0.78, 0.73, 0.86));
        if (isOwl) {
          ball(foot, gold, 0, 0, 0.012, 0.105, 0.055, 0.12);
          for (let toe = -1; toe <= 1; toe++) {
            ball(foot, gold, toe * 0.05, -0.006, 0.087, 0.032, 0.036, 0.075);
            ball(foot, cream, toe * 0.05, -0.004, 0.146, 0.02, 0.022, 0.031);
          }
        } else {
          ball(
            foot,
            species === "dog" ? pink : species === "fox" ? accent : coat,
            0,
            0,
            0.012,
            0.13,
            0.075,
            species === "rabbit" ? 0.2 : 0.17,
          );
          if (details) {
            for (const toe of [-1, 1]) {
              curve(
                foot,
                species === "dog" ? cream : species === "fox" ? coat : pink,
                [
                  [toe * 0.036, 0.02, 0.14],
                  [toe * 0.039, 0.045, 0.113],
                  [toe * 0.04, 0.056, 0.085],
                ],
                [0.003, 0.004, 0.003],
              );
            }
          }
          if (details && species === "dragon") {
            for (const toe of [-1, 1]) {
              curve(
                foot,
                cream,
                [
                  [toe * 0.05, 0.017, 0.147],
                  [toe * 0.05, 0.007, 0.18],
                  [toe * 0.05, -0.016, 0.204],
                ],
                [0.016, 0.014, 0.001],
              );
            }
          }
          const paw = new THREE.Group();
          paw.position.set(sign * (adult ? 0.28 : 0.265), adult ? 0.59 : 0.44, 0.1);
          if (adult) paw.scale.set(0.96, 1.4, 1);
          this.pose.add(paw);
          this.paws.push(paw);
          if (species === "dog") {
            // Front paws reach the floor in a seated, four-legged pose at every growth stage.
            const legLength = adult ? 0.45 : details ? 0.28 : 0.24;
            paw.position.set(sign * (adult ? 0.19 : 0.15), legLength + 0.065, 0.2);
            paw.scale.setScalar(1);
            curve(
              paw,
              pink,
              [
                [0, 0.018, -0.015],
                [0, -legLength * 0.47, 0.012],
                [0, -legLength + 0.025, 0.065],
              ],
              adult ? [0.107, 0.084, 0.073] : [0.088, 0.075, 0.065],
            );
            ball(paw, pink, 0, -legLength, 0.09, adult ? 0.105 : 0.093, 0.06, 0.112);
            for (const toe of [-1, 0, 1])
              ball(paw, cream, toe * 0.036, -legLength - 0.003, 0.163, 0.022, 0.032, 0.036);
            curve(
              paw,
              cream,
              [
                [sign * 0.035, 0.015, -0.025],
                [sign * 0.06, -legLength * 0.3, -0.045],
                [sign * 0.06, -legLength * 0.62, -0.025],
              ],
              [0.048, 0.05, 0.023],
            );
            if (details)
              for (let spot = 0; spot < 4; spot++)
                ball(
                  paw,
                  coat,
                  sign * (0.012 + (spot % 2) * 0.015),
                  -0.065 - spot * 0.059,
                  0.061,
                  0.013,
                  0.019,
                  0.006,
                );
          } else {
            ball(paw, coat, 0, -0.09, 0, 0.086, 0.15, 0.1);
            ball(paw, species === "fox" ? accent : coat, 0, -0.187, 0.032, 0.085, 0.064, 0.088);
          }
          if (adult && species !== "fox" && species !== "dragon" && species !== "dog") {
            ball(paw, pink, 0, -0.188, 0.111, 0.031, 0.025, 0.009);
            for (const toe of [-1, 1])
              ball(paw, pink, toe * 0.033, -0.152, 0.105, 0.013, 0.015, 0.008);
          }
          if (details && species === "dragon") {
            for (const toe of [-1, 1]) {
              curve(
                paw,
                cream,
                [
                  [toe * 0.032, -0.178, 0.101],
                  [toe * 0.032, -0.19, 0.125],
                  [toe * 0.032, -0.204, 0.146],
                ],
                [0.014, 0.011, 0.001],
              );
            }
          }
        }
        const ear = new THREE.Group();
        ear.position.set(
          sign * (species === "rabbit" ? 0.18 : 0.235),
          0.235,
          species === "dragon" ? -0.065 : -0.025,
        );
        this.head.add(ear);
        this.ears.push(ear);
        if (species === "dog") {
          ear.position.set(sign * (adult ? 0.305 : 0.29), adult ? 0.215 : 0.2, 0.01);
          const height = adult ? 0.395 : details ? 0.29 : 0.25;
          // Rounded floppy ears have soft tips and no sharp dangling strands.
          const earMesh = ball(
            ear,
            accent,
            sign * 0.055,
            -height * 0.31,
            0.025,
            adult ? 0.12 : 0.11,
            height * 0.69,
            0.075,
          );
          earMesh.rotation.z = sign * (sign === 1 ? 0.43 : 0.14);
          ball(ear, accent, sign * 0.025, 0.03, 0, 0.112, 0.083, 0.068);
          for (let lock = 0; lock < (adult ? 4 : 2); lock++) {
            const fluff = ball(
              ear,
              accent,
              sign * (0.11 + lock * 0.019),
              -0.055 - lock * 0.05,
              -0.009,
              0.065,
              0.064,
              0.051,
            );
            fluff.rotation.z = sign * -0.25;
          }
        } else if (species === "rabbit") {
          const height = stage === 1 ? 0.365 : adult ? 0.64 : 0.435;
          const volume: EarVolume = {
            width: adult ? 0.09 : 0.085,
            height,
            bend: sign * (adult ? 0.09 : 0.035),
            depth: 0.073,
            oval: true,
          };
          softEar(ear, coat, volume);
          earInsert(
            ear,
            pink,
            earShape(0.043, height * 0.76, sign * (adult ? 0.065 : 0.026)),
            volume,
            0.05,
          );
        } else if (species === "dragon") {
          curve(
            ear,
            cream,
            [
              [0, 0, 0],
              [sign * (adult ? 0.035 : 0.006), adult ? 0.14 : 0.065, -0.008],
              [sign * (adult ? 0.1 : 0.03), adult ? 0.31 : 0.13, adult ? -0.13 : -0.055],
            ],
            [0.06, 0.039, 0.002],
          );
          const fin = shapeMesh(
            this.head,
            coat,
            earShape(0.08, 0.17, sign * 0.035),
            sign * 0.31,
            0.06,
            -0.018,
          );
          fin.rotation.z = sign * -1.04;
          shapeMesh(
            this.head,
            accent,
            earShape(0.035, 0.1),
            sign * 0.365,
            0.097,
            0.018,
            0.012,
            0.007,
          ).rotation.z = sign * -1.04;
        } else if (isOwl) {
          const height = adult ? 0.29 : details ? 0.15 : 0.095;
          const volume: EarVolume = {
            width: adult ? 0.085 : 0.065,
            height,
            bend: sign * (adult ? 0.09 : 0.027),
            depth: 0.045,
          };
          softEar(ear, accent, volume);
          earInsert(ear, coat, earShape(0.031, height * 0.62, sign * 0.015), volume, 0.015);
        } else {
          const fox = species === "fox";
          const height = fox ? (adult ? 0.36 : 0.235) : adult ? 0.25 : 0.195;
          const volume: EarVolume = {
            width: fox ? 0.11 : 0.12,
            height,
            bend: sign * 0.015,
            depth: fox ? 0.065 : 0.073,
          };
          softEar(ear, fox ? accent : coat, volume);
          if (fox) earInsert(ear, coat, earShape(0.073, height * 0.65), volume, 0, 0.006);
          earInsert(
            ear,
            pink,
            earShape(fox ? 0.044 : 0.064, height * (fox ? 0.51 : 0.6)),
            volume,
            0.022,
            fox ? 0.014 : 0.006,
          );
        }
        if (isOwl) {
          ball(this.head, accent, sign * 0.145, 0.018, 0.26, 0.183, 0.203, 0.052);
          ball(this.head, cream, sign * 0.145, 0.018, 0.282, 0.166, 0.184, 0.047);
          makeEye(
            sign * 0.142,
            0.031,
            0.324,
            stage === 1 ? 0.086 : 0.075,
            stage === 1 ? 0.1 : 0.089,
          );
          curve(
            this.head,
            accent,
            [
              [sign * 0.245, 0.15, 0.3],
              [sign * 0.15, 0.205, 0.303],
              [sign * 0.055, 0.153, 0.307],
            ],
            [0.012, 0.024, 0.012],
          );
        } else {
          if (species === "fox") {
            const mask = new THREE.Shape();
            mask.moveTo(sign * 0.025, -0.11);
            mask.bezierCurveTo(sign * 0.08, -0.195, sign * 0.27, -0.18, sign * 0.32, -0.04);
            mask.bezierCurveTo(sign * 0.22, -0.085, sign * 0.21, 0.08, sign * 0.15, 0.115);
            mask.bezierCurveTo(sign * 0.105, 0.015, sign * 0.045, -0.04, sign * 0.025, -0.11);
            shapeMesh(this.head, cream, mask, 0, 0, 0.25, 0.028, 0.015);
          }
          makeEye(
            sign * (species === "dog" ? 0.137 : species === "dragon" ? 0.147 : 0.137),
            species === "dog" ? 0.058 : 0.055,
            species === "dog"
              ? 0.311
              : species === "fox"
                ? 0.292
                : species === "dragon"
                  ? 0.26
                  : 0.29,
            species === "dog" ? (stage === 1 ? 0.082 : 0.077) : stage === 1 ? 0.061 : 0.052,
            species === "dog" ? (stage === 1 ? 0.09 : 0.082) : stage === 1 ? 0.081 : 0.069,
          );
          if (species !== "fox" && species !== "dog")
            ball(this.head, pink, sign * 0.225, -0.055, 0.267, 0.048, 0.024, 0.014);
        }
        if (isOwl || (species === "dragon" && details)) {
          const wing = new THREE.Group();
          wing.position.set(
            sign * (adult ? 0.3 : isOwl ? 0.265 : 0.235),
            adult ? 0.68 : isOwl ? 0.49 : 0.51,
            isOwl ? -0.005 : -0.13,
          );
          this.pose.add(wing);
          this.wings.push(wing);
          if (adult) wing.scale.set(isOwl ? 1.22 : 1.5, isOwl ? 1.42 : 1.4, 1);
          if (isOwl) {
            const feather = new THREE.Shape();
            feather.moveTo(0, 0.06);
            feather.bezierCurveTo(sign * 0.18, 0.09, sign * 0.26, -0.13, sign * 0.205, -0.26);
            feather.quadraticCurveTo(sign * 0.175, -0.38, sign * 0.14, -0.3);
            feather.quadraticCurveTo(sign * 0.1, -0.4, sign * 0.074, -0.31);
            feather.quadraticCurveTo(sign * 0.035, -0.36, 0, -0.27);
            feather.quadraticCurveTo(sign * -0.03, -0.1, 0, 0.06);
            shapeMesh(wing, accent, feather, 0, 0, 0, 0.075, 0.022);
            for (let row = 0; row < (details ? 3 : 2); row++) {
              const stripe = ball(
                wing,
                coat,
                sign * (0.066 + row * 0.05),
                -0.115 - row * 0.035,
                0.062,
                0.034,
                0.115 - row * 0.01,
                0.013,
              );
              stripe.rotation.z = sign * -0.25;
            }
          } else {
            const membrane = new THREE.Shape();
            membrane.moveTo(0, 0);
            membrane.bezierCurveTo(sign * 0.04, 0.14, sign * 0.16, 0.25, sign * 0.28, 0.23);
            membrane.quadraticCurveTo(sign * 0.24, 0.095, sign * 0.35, 0.023);
            membrane.quadraticCurveTo(sign * 0.2, 0.065, sign * 0.225, -0.095);
            membrane.quadraticCurveTo(sign * 0.11, -0.015, sign * 0.1, -0.175);
            membrane.quadraticCurveTo(sign * 0.035, -0.08, 0, 0);
            shapeMesh(wing, satin("#a4cbb7", 0.84), membrane, 0, 0, 0, 0.025, 0.012);
            curve(
              wing,
              accent,
              [
                [0, 0, 0.027],
                [sign * 0.1, 0.17, 0.027],
                [sign * 0.28, 0.23, 0.027],
              ],
              [0.021, 0.017, 0.009],
            );
            for (const [x, y] of [
              [0.35, 0.023],
              [0.225, -0.095],
              [0.1, -0.175],
            ])
              curve(
                wing,
                accent,
                [
                  [sign * 0.09, 0.15, 0.026],
                  [sign * x * 0.7, y * 0.4, 0.026],
                  [sign * x, y, 0.026],
                ],
                [0.015, 0.011, 0.005],
              );
            if (!adult) wing.scale.setScalar(0.76);
          }
        }
      }
      if (species === "dog") {
        // A short muzzle and warm cheeks soften the expression without losing the markings.
        curve(
          this.head,
          cream,
          [
            [-0.01, 0.322, 0.147],
            [0.002, 0.28, 0.211],
            [0.005, 0.22, 0.259],
          ],
          [0.008, 0.012, 0.005],
        );
        const muzzle = new THREE.Group();
        muzzle.position.set(0, -0.098, 0.292);
        muzzle.scale.set(
          adult ? 1.1 : 1,
          adult ? 1.05 : 1,
          stage === 1 ? 0.95 : adult ? 1.34 : 1.08,
        );
        this.head.add(muzzle);
        const warmCream = satin("#e3c797", 0.85);
        const noseMaterial = satin("#292b32", 0.37);
        ball(muzzle, warmCream, 0, -0.008, 0.035, 0.155, 0.093, 0.094);
        ball(muzzle, cream, 0, -0.059, 0.035, 0.128, 0.069, 0.08);
        for (const sign of [-1, 1]) {
          ball(muzzle, warmCream, sign * 0.063, -0.009, 0.081, 0.094, 0.064, 0.073);
          ball(this.head, satin("#d4a080"), sign * 0.238, -0.065, 0.264, 0.034, 0.019, 0.01);
        }
        const nose = ball(muzzle, noseMaterial, 0, 0.025, 0.144, 0.052, 0.035, 0.032);
        ball(nose, coat, -0.23, 0.4, 0.84, 0.18, 0.1, 0.06);
        curve(
          muzzle,
          accent,
          [
            [-0.086, -0.043, 0.133],
            [-0.052, -0.067, 0.148],
            [0, -0.07, 0.149],
            [0.052, -0.067, 0.148],
            [0.086, -0.043, 0.133],
          ],
          [0.003, 0.004, 0.004, 0.004, 0.003],
        );
        ball(muzzle, satin("#e8a0ad"), 0.005, -0.086, 0.145, 0.027, 0.033, 0.013);
        if (adult) {
          // Mature cheek feathers are rounded and sit behind the friendly tan muzzle.
          for (const sign of [-1, 1]) {
            for (let lock = 0; lock < 3; lock++) {
              const feather = ball(
                this.head,
                cream,
                sign * (0.283 + lock * 0.018),
                -0.09 - lock * 0.049,
                0.13 - lock * 0.018,
                0.075,
                0.068,
                0.084,
              );
              feather.rotation.z = sign * -0.32;
            }
          }
        }
        // Rounded overlapping volumes give the chest a plush outline.
        ball(torso, cream, 0, 0.405, 0.2, adult ? 0.239 : 0.212, 0.214, adult ? 0.119 : 0.102);
        ball(torso, cream, 0, 0.555, 0.13, adult ? 0.255 : 0.218, adult ? 0.147 : 0.115, 0.139);
        for (const sign of [-1, 1]) {
          for (let tuft = 0; tuft < (adult ? 4 : 2); tuft++) {
            ball(
              torso,
              cream,
              sign * (0.105 + tuft * (adult ? 0.051 : 0.047)),
              adult ? 0.55 - tuft * 0.067 : 0.52 - tuft * 0.064,
              0.13,
              adult ? 0.097 : 0.086,
              adult ? 0.11 : 0.094,
              0.106,
            );
          }
        }
        if (details) {
          curve(
            torso,
            satin("#344443"),
            [
              [-0.19, 0.55, 0.175],
              [0, 0.525, 0.278],
              [0.19, 0.55, 0.175],
            ],
            [0.014, 0.014, 0.014],
          );
          const tag = ball(torso, satin("#c8d0cc", 0.35), 0, 0.488, 0.294, 0.024, 0.026, 0.007);
          tag.rotation.z = -0.12;
        }
      } else if (species === "cat" || species === "rabbit") {
        for (const sign of [-1, 1])
          ball(this.head, cream, sign * 0.069, -0.105, 0.282, 0.104, 0.075, 0.063);
        const nose = new THREE.Shape();
        nose.moveTo(-0.026, 0.013);
        nose.quadraticCurveTo(0, 0.032, 0.026, 0.013);
        nose.quadraticCurveTo(0.014, -0.007, 0, -0.018);
        nose.quadraticCurveTo(-0.014, -0.007, -0.026, 0.013);
        shapeMesh(this.head, pink, nose, 0, -0.084, 0.344, 0.017, 0.008);
        smile(0, -0.12, 0.342, 0.048);
        if (species === "cat") {
          for (const sign of [-1, 1]) {
            for (let i = 0; i < (adult ? 3 : details ? 2 : 1); i++) {
              curve(
                this.head,
                accent,
                [
                  [sign * 0.2, -0.087 - i * 0.019, 0.25],
                  [sign * 0.28, -0.063 - i * 0.026, 0.278],
                  [sign * 0.36, -0.04 - i * 0.033, 0.259],
                ],
                [0.004, 0.004, 0.001],
              );
            }
          }
          if (details)
            for (const sign of [-1, 1]) {
              curve(
                this.head,
                accent,
                [
                  [sign * 0.08, 0.27, 0.12],
                  [sign * 0.073, 0.224, 0.2],
                  [sign * 0.07, 0.192, 0.229],
                ],
                [0.01, 0.014, 0.002],
              );
            }
        } else {
          const tuft = ball(this.head, cream, 0, 0.275, 0.12, 0.052, 0.08, 0.066);
          tuft.rotation.z = -0.3;
        }
      } else if (species === "fox") {
        ball(this.head, cream, 0, -0.111, 0.29, 0.134, 0.089, 0.151);
        ball(this.head, accent, 0, -0.086, 0.422, 0.046, 0.031, 0.027);
        smile(0, -0.14, 0.391, 0.06);
      } else if (isOwl) {
        const beak = new THREE.Shape();
        beak.moveTo(-0.048, 0.015);
        beak.quadraticCurveTo(0, 0.044, 0.048, 0.015);
        beak.quadraticCurveTo(0.035, -0.038, 0, -0.1);
        beak.quadraticCurveTo(-0.035, -0.038, -0.048, 0.015);
        shapeMesh(this.head, gold, beak, 0, -0.035, 0.33, 0.054, 0.014);
        if (details) {
          for (let row = 0; row < (adult ? 3 : 2); row++) {
            for (let column = 0; column < 3 - (row % 2); column++) {
              const x = (column - (2 - (row % 2)) / 2) * 0.078;
              const feather = ball(torso, coat, x, 0.37 - row * 0.079, 0.272, 0.021, 0.034, 0.01);
              feather.rotation.z = -0.12;
            }
          }
        }
      } else {
        ball(this.head, coat, 0, -0.095, 0.245, 0.224, 0.107, 0.155);
        ball(this.head, cream, 0, -0.158, 0.285, 0.176, 0.041, 0.109);
        for (const sign of [-1, 1]) {
          ball(this.head, accent, sign * 0.073, -0.037, 0.379, 0.021, 0.013, 0.007);
          ball(this.head, coat, sign * 0.073, -0.026, 0.377, 0.029, 0.016, 0.009);
        }
        curve(
          this.head,
          accent,
          [
            [-0.13, -0.116, 0.365],
            [0, -0.14, 0.392],
            [0.13, -0.116, 0.365],
          ],
          [0.003, 0.005, 0.003],
        );
        if (details) {
          for (let row = 0; row < (adult ? 4 : 3); row++) {
            ball(
              torso,
              cream,
              0,
              0.14 + row * 0.081,
              0.235,
              0.145 - Math.abs(1.5 - row) * 0.018,
              0.039,
              0.034,
            );
          }
          for (let row = 0; row < (adult ? 3 : 2); row++) {
            shapeMesh(
              torso,
              cream,
              earShape(0.042, 0.09 - row * 0.012),
              0,
              0.47 - row * 0.1,
              -0.222,
              0.034,
              0.01,
            );
          }
        }
      }
      if (adult) {
        if (species === "cat" || species === "fox") {
          // A mature ruff changes the silhouette as well as the colour of the chest.
          for (const sign of [-1, 1]) {
            for (let tuft = 0; tuft < 3; tuft++) {
              curve(
                torso,
                cream,
                [
                  [sign * (0.08 + tuft * 0.06), 0.59 - tuft * 0.03, 0.12],
                  [sign * (0.15 + tuft * 0.07), 0.52 - tuft * 0.035, 0.19],
                  [sign * (0.07 + tuft * 0.13), 0.32 + tuft * 0.035, 0.2],
                ],
                [0.06, 0.07, 0.001],
              );
            }
            for (let tuft = 0; tuft < 2; tuft++) {
              curve(
                this.head,
                species === "fox" ? cream : coat,
                [
                  [sign * 0.24, -0.07 - tuft * 0.055, 0.12],
                  [sign * 0.32, -0.055 - tuft * 0.045, 0.16],
                  [sign * (0.41 - tuft * 0.04), -0.01 - tuft * 0.13, 0.1],
                ],
                [0.065, 0.06, 0.001],
              );
            }
          }
        } else if (species === "rabbit") {
          for (const sign of [-1, 1]) {
            ball(torso, coat, sign * 0.23, 0.18, -0.012, 0.175, 0.19, 0.205);
            curve(
              torso,
              cream,
              [
                [sign * 0.08, 0.6, 0.14],
                [sign * 0.15, 0.54, 0.2],
                [sign * 0.21, 0.43, 0.17],
              ],
              [0.075, 0.09, 0.002],
            );
          }
        } else if (species === "dragon") {
          for (let row = 0; row < 3; row++) {
            shapeMesh(
              this.head,
              cream,
              earShape(0.045, 0.15 - row * 0.025),
              0,
              0.27 - row * 0.045,
              0.03 - row * 0.13,
              0.035,
              0.012,
            );
          }
        }
      }
      this.tail.position.set(0.1, 0.18, -0.2);
      if (adult) {
        this.tail.scale.set(
          species === "cat" ? 1.5 : species === "fox" ? 1.45 : 1.3,
          species === "cat" ? 1.7 : species === "fox" ? 1.5 : 1.3,
          1.12,
        );
      }
      this.pose.add(this.tail);
      if (species === "dog") {
        this.tail.position.y = adult ? 0.255 : 0.18;
        if (adult) this.tail.scale.set(1.3, 1.5, 1.3);
        const tailCoat = satin("#ffffff", 0.86);
        tailCoat.vertexColors = true;
        const plume = curve(
          this.tail,
          tailCoat,
          [
            [-0.035, 0, 0],
            [0.13, -0.015, -0.14],
            [0.32, 0.045, -0.22],
            [0.46, 0.15, -0.16],
            [0.48, 0.24, -0.055],
          ],
          [
            0.068,
            adult ? 0.138 : 0.115,
            adult ? 0.18 : details ? 0.12 : 0.095,
            adult ? 0.108 : 0.085,
            0.028,
          ],
          1,
          24,
        );
        ball(this.tail, cream, 0.48, 0.24, -0.055, 0.029, 0.029, 0.029);
        const vertices = plume.geometry.attributes.position;
        const colors: number[] = [];
        const grey = new THREE.Color(palette.coat);
        const light = new THREE.Color(palette.cream);
        for (let i = 0; i < vertices.count; i++) {
          const x = vertices.getX(i),
            y = vertices.getY(i),
            z = vertices.getZ(i);
          const transition = x + Math.sin(y * 23 + z * 18) * 0.035;
          const color = grey
            .clone()
            .lerp(light, THREE.MathUtils.smoothstep(transition, 0.15, 0.43));
          colors.push(color.r, color.g, color.b);
        }
        plume.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        for (let tuft = 0; tuft < (adult ? 7 : details ? 4 : 3); tuft++) {
          const t = tuft / (adult ? 6 : details ? 3 : 2);
          const fluff = ball(
            this.tail,
            t > 0.5 ? cream : coat,
            0.14 + t * 0.29,
            0.015 + t * 0.14,
            -0.2,
            adult ? 0.1 : 0.077,
            adult ? 0.089 : 0.07,
            adult ? 0.114 : 0.09,
          );
          fluff.rotation.z = t * 0.5;
        }
      } else if (species === "rabbit") {
        ball(this.tail, cream, 0, 0.015, -0.095, 0.13, 0.12, 0.13);
        if (details)
          for (const sign of [-1, 1])
            ball(this.tail, cream, sign * 0.061, 0.02, -0.145, 0.063, 0.074, 0.075);
      } else if (species === "fox") {
        curve(
          this.tail,
          [coat, cream],
          [
            [-0.02, 0, 0],
            [0.07, -0.01, -0.13],
            [0.23, 0.05, -0.27],
            [0.34, 0.22, -0.26],
            [0.29, 0.39, -0.19],
          ],
          [0.077, 0.145, adult ? 0.169 : 0.142, 0.121, 0.002],
          0.71,
        );
      } else if (species === "cat") {
        curve(
          this.tail,
          [coat, accent],
          [
            [-0.025, 0, 0],
            [0.11, -0.015, -0.14],
            [0.29, 0.1, -0.19],
            [0.33, 0.3, -0.17],
            [0.23, 0.39, -0.15],
            [0.17, 0.32, -0.13],
          ],
          [0.06, 0.065, 0.061, 0.054, 0.045, 0.008],
          0.81,
        );
      } else if (species === "dragon") {
        curve(
          this.tail,
          coat,
          [
            [-0.06, 0, 0],
            [0.02, -0.025, -0.15],
            [0.17, 0.02, -0.3],
            [0.3, 0.15, -0.31],
            [0.28, 0.28, -0.23],
          ],
          [0.11, 0.094, 0.07, 0.046, 0.002],
        );
        if (details)
          for (let row = 0; row < (adult ? 3 : 2); row++) {
            shapeMesh(
              this.tail,
              cream,
              earShape(0.035, 0.074),
              0.03 + row * 0.086,
              0.062 + row * 0.022,
              -0.15 - row * 0.073,
              0.027,
              0.008,
            );
          }
      } else {
        const feathers = adult ? 5 : 3;
        for (let i = 0; i < feathers; i++) {
          const spread = i - (feathers - 1) / 2;
          const feather = shapeMesh(
            this.tail,
            i === 1 ? coat : accent,
            earShape(0.062, 0.22),
            spread * 0.072 - 0.08,
            -0.1,
            -0.12,
            0.048,
            0.016,
          );
          feather.rotation.x = -1.03;
          feather.rotation.z = spread * 0.24;
        }
      }
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
    return this.pose.localToWorld(
      target.set(0, this.stage === 0 ? 0.35 : this.stage === 3 ? 0.72 : 0.58, 0),
    );
  }

  getInteractionRadius(): number {
    return (
      (this.stage === 0 ? 0.4 : this.stage === 3 ? 0.61 : 0.48) * this.bodyScale * this.root.scale.x
    );
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
    this.head.position.copy(this.headRestPosition);
    this.head.scale.copy(this.headRestScale);
    this.head.rotation.set(Math.sin(t) * 0.035 * idle, 0, Math.sin(t * 0.8) * 0.045 * idle);
    this.tail.rotation.y =
      Math.sin(t * (this.species === "dog" ? 5.2 : 2.6)) *
      (this.species === "dog" ? 0.32 : 0.18) *
      idle;
    this.ears.forEach((ear, i) => {
      ear.rotation.z = (i === 0 ? -1 : 1) * (0.12 + Math.sin(t * 1.6) * 0.035 * idle);
    });
    this.wings.forEach((wing, i) => {
      wing.rotation.set(0, 0, (i === 0 ? -1 : 1) * Math.sin(t * 1.8) * 0.08 * idle);
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
        case "wave": {
          const arm = this.species === "owl" ? this.wings[1] : this.paws[1];
          if (arm) {
            arm.rotation.z =
              this.species === "dog"
                ? 0.2 * envelope
                : -(1.9 + Math.sin(cycle * 4) * 0.3) * envelope;
            if (this.species === "dog")
              arm.rotation.x = (-1.08 + Math.sin(cycle * 3) * 0.12) * envelope;
          }
          this.head.rotation.z += 0.15 * envelope;
          this.tail.rotation.y += Math.sin(cycle * 4) * 0.5 * envelope;
          break;
        }
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
        case "beg":
          this.pose.scale.y *= 1 + 0.08 * envelope;
          this.head.rotation.x -= 0.18 * envelope;
          this.head.rotation.z += Math.sin(cycle) * 0.12 * envelope;
          this.paws.forEach((paw, i) => {
            paw.rotation.x = (-1.25 + Math.sin(cycle * 2 + i * 0.6) * 0.12) * envelope;
            paw.rotation.z = (i ? 0.18 : -0.18) * envelope;
          });
          this.tail.rotation.y += Math.sin(cycle * 6) * 0.45 * envelope;
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
          this.head.scale.y /= 1 - 0.4 * envelope;
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
          {
            const arm = this.species === "owl" ? this.wings[1] : this.paws[1];
            if (arm) {
              arm.rotation.z = -1.45 * envelope;
              arm.rotation.x = (-0.7 + Math.sin(cycle * 6) * 0.15) * envelope;
            }
          }
          closedEyes = envelope * 0.75;
          break;
      }
    }
    const blink = idle && t % 4.6 < 0.16 ? 0.08 : Math.max(0.06, 1 - closedEyes);
    this.eyes.forEach(({ mesh, height }) => {
      mesh.scale.y = height * blink;
      if (this.species === "dog") {
        // Closed eyes become a thin, soft line rather than protruding dark ovals.
        mesh.scale.z = THREE.MathUtils.lerp(0.007, 0.035, blink);
      }
    });
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
          (this.stage === 0 ? 0.75 : this.stage === 3 ? 1.5 : 1.2) +
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
