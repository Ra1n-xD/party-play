import * as THREE from "three";
import { getAvatar, type AvatarId } from "../../../../../shared/platform/avatars";
import { faceSurfaceDepth, facialGaussian } from "./AvatarSculpt";

export interface AvatarExpression {
  smile: number;
  open: number;
  brow: number;
  squint: number;
  blink: number;
  gazeX: number;
  gazeY: number;
}

export interface AvatarFaceRig {
  pose(expression: AvatarExpression): void;
}

const clamp = THREE.MathUtils.clamp;
type Surface = (u: number, v: number, smile: number, open: number) => [number, number, number];

/** Small, prebuilt surface targets keep expressions on the GPU, including the lips. */
function expressiveSurface(surface: Surface, columns = 20, rows = 4) {
  const geometry = new THREE.PlaneGeometry(1, 1, columns, rows);
  const positions = geometry.getAttribute("position");
  const variants: Float32Array[] = [];
  for (const [smile, open] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
  ]) {
    const vertices = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const u = positions.getX(i) * 2;
      const v = positions.getY(i) * 2;
      vertices.set(surface(u, v, smile, open), i * 3);
    }
    variants.push(vertices);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(variants[0], 3));
  geometry.morphAttributes.position = variants
    .slice(1)
    .map((array) => new THREE.BufferAttribute(array, 3));
  geometry.computeVertexNormals();
  // Lighting follows the swept lids and parted lips as well as their silhouettes.
  geometry.morphAttributes.normal = variants.slice(1).map((vertices) => {
    const target = new THREE.PlaneGeometry(1, 1, columns, rows);
    target.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    target.computeVertexNormals();
    const normals = target.getAttribute("normal").clone();
    target.dispose();
    return normals;
  });
  return geometry;
}

function addMesh(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function irisGeometry(color: number) {
  const geometry = new THREE.CircleGeometry(1, 24);
  const colors = [];
  const tint = new THREE.Color(color);
  const dark = new THREE.Color(0x162320);
  for (let i = 0; i < geometry.getAttribute("position").count; i++) {
    const shade = i === 0 ? dark : tint.clone().multiplyScalar(0.72 + 0.22 * Math.sin(i * 1.8));
    colors.push(shade.r, shade.g, shade.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Facial details follow the sculpted surface; nothing is reconstructed during a frame. */
export function makeAvatarFace(
  avatarId: AvatarId,
  head: THREE.Group,
  skin: THREE.Mesh,
): AvatarFaceRig {
  const avatar = getAvatar(avatarId);
  const robot = avatarId === "robot";
  const alien = avatarId === "alien";
  const human = avatarId === "human" || avatarId === "astronaut";
  const monkey = avatarId === "monkey";
  const face = new THREE.Group();
  face.name = "facial-rig";
  head.add(face);
  const lidColor = monkey || avatarId === "panda" ? avatar.accent : avatar.skin;
  const lidMaterial = new THREE.MeshStandardMaterial({
    color: lidColor,
    roughness: 0.74,
    side: THREE.DoubleSide,
  });
  const browMaterial = new THREE.MeshStandardMaterial({
    color: human ? 0x48322b : alien ? 0x578453 : robot ? avatar.accent : 0x4d3b32,
    roughness: 0.82,
    emissive: robot ? avatar.accent : 0,
    emissiveIntensity: robot ? 0.35 : 0,
  });
  const scleraMaterial = new THREE.MeshStandardMaterial({
    color: alien ? 0x1a3030 : robot ? avatar.accent : 0xfff1de,
    roughness: 0.35,
    emissive: robot ? avatar.accent : 0,
    emissiveIntensity: robot ? 0.65 : 0,
  });
  const irisMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34 });
  const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x102222, roughness: 0.25 });
  const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xfffcf0 });
  const eyes: {
    aperture: THREE.Group;
    iris: THREE.Group;
    topLid: THREE.Mesh;
    bottomLid: THREE.Mesh;
    brow: THREE.Mesh;
    x: number;
    width: number;
    height: number;
  }[] = [];
  for (const side of [-1, 1]) {
    const x = side * (alien ? 0.103 : 0.093);
    const y = robot ? 0.035 : 0.055;
    const z = robot ? 0.205 : monkey ? 0.228 : human ? 0.215 : 0.222;
    const width = alien ? 0.054 : robot ? 0.042 : 0.041;
    const height = alien ? 0.064 : robot ? 0.027 : 0.024;
    const aperture = new THREE.Group();
    aperture.position.set(x, y, z);
    aperture.rotation.z = alien ? -side * 0.23 : -side * 0.035;
    face.add(aperture);
    const white = addMesh(
      aperture,
      new THREE.SphereGeometry(1, 24, 14),
      scleraMaterial,
      "eye-white",
    );
    white.scale.set(width, height, 0.014);
    const iris = new THREE.Group();
    iris.position.z = 0.0145;
    aperture.add(iris);
    if (!robot) {
      const irisDisk = addMesh(
        iris,
        irisGeometry(alien ? 0x304947 : avatarId === "cat" ? 0x82954c : 0x7c6451),
        irisMaterial,
        "iris",
      );
      irisDisk.scale.setScalar(alien ? 0.033 : 0.0185);
      const pupil = addMesh(iris, new THREE.CircleGeometry(1, 20), pupilMaterial, "pupil");
      pupil.position.z = 0.0008;
      pupil.scale.set(
        alien ? 0.022 : avatarId === "cat" ? 0.005 : 0.0087,
        alien ? 0.033 : 0.0115,
        1,
      );
      const glint = addMesh(
        iris,
        new THREE.CircleGeometry(0.0046, 10),
        glintMaterial,
        "eye-catchlight",
      );
      glint.position.set(-0.005, 0.007, 0.0016);
    }
    const eyelid = (upper: boolean) => {
      const sign = upper ? 1 : -1;
      const geometry = expressiveSurface(
        (u, v, closed) => {
          const edge = Math.sqrt(Math.max(0, 1 - u * u));
          const along = (v + 1) / 2;
          const inner = sign * (upper ? 0.79 : 0.87) * (1 - closed) - closed * 0.018;
          const yy = edge * (inner + (sign - inner) * along);
          return [
            u * width * 1.015,
            yy * height,
            Math.sqrt(Math.max(0, 1 - u * u - yy * yy)) * 0.014 + 0.0058,
          ];
        },
        24,
        8,
      );
      const mesh = addMesh(
        aperture,
        geometry,
        robot ? browMaterial : lidMaterial,
        upper ? "upper-eyelid" : "lower-eyelid",
      );
      return mesh;
    };
    const topLid = eyelid(true);
    const bottomLid = eyelid(false);
    const browGeometry = expressiveSurface((u, v, raised, worried) => {
      const xx = x + u * width * 1.1;
      const yy =
        y +
        height +
        0.025 +
        (1 - u * u) * 0.008 +
        raised * (0.018 - side * u * 0.005) +
        worried * (-0.012 - side * u * 0.011) +
        v * (human ? 0.0045 : 0.003);
      return [xx, yy, robot ? z + 0.003 : faceSurfaceDepth(avatarId, xx, yy) + 0.004];
    });
    const brow = addMesh(face, browGeometry, browMaterial, "expression-brow");
    eyes.push({ aperture, iris, topLid, bottomLid, brow, x, width, height });
  }

  const mouthY = robot ? -0.069 : human ? -0.134 : alien ? -0.143 : -0.123;
  const mouthZ = robot ? 0.206 : human ? 0.232 : alien ? 0.206 : monkey ? 0.271 : 0.28;
  // Follow the deformed jaw surface rather than leaving a flat mouth inside the cheeks.
  const mouthDepth = (x: number, y: number, smile: number, open: number) => {
    if (robot) return mouthZ;
    const jawWeight = THREE.MathUtils.smoothstep(-y, 0.03, 0.24) * facialGaussian(x, 0.19);
    const smileWeight =
      facialGaussian(Math.abs(x) - 0.073, 0.075) * facialGaussian(y + 0.105, 0.095);
    const originalY = y + open * jawWeight * 0.034 - Math.max(0, smile) * smileWeight * 0.01;
    return faceSurfaceDepth(avatarId, x, originalY) + open * jawWeight * 0.005 + 0.0045;
  };
  const mouthWidth = robot ? 0.061 : human ? 0.055 : alien ? 0.043 : 0.062;
  const center = (u: number, smile: number) =>
    mouthY + 0.007 * u * u + smile * (u * u * 0.022 - 0.005);
  const opening = (u: number, open: number) =>
    Math.pow(Math.max(0, 1 - u * u), 0.7) * (0.0014 + open * 0.03);
  const mouthMaterial = new THREE.MeshStandardMaterial({
    color: robot ? avatar.accent : 0x4b292b,
    roughness: 0.84,
    side: THREE.DoubleSide,
    emissive: robot ? avatar.accent : 0,
    emissiveIntensity: robot ? 0.6 : 0,
  });
  const mouth = addMesh(
    face,
    expressiveSurface((u, v, smile, open) => {
      const x = u * mouthWidth * (1 + Math.max(0, smile) * 0.14 - open * 0.13);
      const y = center(u, smile) - open * 0.014 + v * opening(u, open);
      return [x, y, mouthDepth(x, y, smile, open)];
    }),
    mouthMaterial,
    "expression-mouth",
  );
  const lips: THREE.Mesh[] = [];
  if (!robot) {
    const lipMaterial = new THREE.MeshStandardMaterial({
      color: human ? 0xb87768 : alien ? 0x668d60 : 0x756052,
      roughness: 0.73,
      side: THREE.DoubleSide,
    });
    for (const sign of [-1, 1]) {
      lips.push(
        addMesh(
          face,
          expressiveSurface((u, v, smile, open) => {
            const fullness = Math.sqrt(Math.max(0, 1 - u * u));
            const along = (v + 1) / 2;
            const x = u * mouthWidth * (1 + Math.max(0, smile) * 0.14 - open * 0.13);
            const y =
              center(u, smile) -
              open * 0.014 +
              sign * (opening(u, open) + along * fullness * (human ? 0.0048 : 0.003));
            return [
              x,
              y,
              mouthDepth(x, y, smile, open) + Math.sin(along * Math.PI) * fullness * 0.002 + 0.0008,
            ];
          }),
          lipMaterial,
          "expression-lip",
        ),
      );
    }
  }
  const teeth = addMesh(
    face,
    expressiveSurface((u, v, smile, open) => {
      const across = u * 0.72;
      const x = across * mouthWidth * (1 + Math.max(0, smile) * 0.14 - open * 0.13);
      const along = (v + 1) / 2;
      const y =
        center(across, smile) -
        open * 0.014 +
        opening(across, open) * (0.72 - along * (avatarId === "rabbit" ? 0.8 : 0.44));
      return [x, y, mouthDepth(x, y, smile, open) + 0.0006];
    }),
    new THREE.MeshStandardMaterial({ color: 0xfff0d9, roughness: 0.42, side: THREE.DoubleSide }),
    "expression-teeth",
  );
  const expressive = [mouth, ...lips, teeth];
  const pose = (expression: AvatarExpression) => {
    const smile = clamp(expression.smile, -1, 1);
    const open = clamp(expression.open, 0, 1);
    const brow = clamp(expression.brow, -1, 1);
    const closure = Math.max(clamp(expression.blink, 0, 1), clamp(expression.squint, 0, 1) * 0.65);
    const aperture = Math.max(0.045, 1 - closure);
    for (const eye of eyes) {
      eye.aperture.scale.y = robot ? aperture : 1;
      eye.iris.position.x = clamp(expression.gazeX, -1, 1) * eye.width * 0.2;
      eye.iris.position.y = clamp(expression.gazeY, -1, 1) * eye.height * 0.22;
      eye.topLid.morphTargetInfluences![0] = robot ? 0 : closure;
      eye.bottomLid.morphTargetInfluences![0] = robot ? 0 : closure;
      eye.brow.morphTargetInfluences![0] = Math.max(0, brow);
      eye.brow.morphTargetInfluences![1] = 0;
      eye.brow.morphTargetInfluences![2] = Math.max(0, -brow);
    }
    for (const mesh of expressive) {
      mesh.morphTargetInfluences![0] = Math.max(0, smile);
      mesh.morphTargetInfluences![1] = Math.max(0, -smile);
      mesh.morphTargetInfluences![2] = open;
    }
    teeth.visible = !robot && open > 0.18;
    if (skin.morphTargetInfluences) {
      skin.morphTargetInfluences[0] = Math.max(0, smile);
      skin.morphTargetInfluences[1] = open;
    }
  };
  pose({ smile: 0.16, open: 0, brow: 0, squint: 0, blink: 0, gazeX: 0, gazeY: 0 });
  return { pose };
}
