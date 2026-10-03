import * as THREE from "three";

const clamp = THREE.MathUtils.clamp;

/** A continuous skin surface with a three-joint chain for each digit. */
export function makeArticulatedHand(skin: number, side: number, holding: boolean) {
  const root = new THREE.Group();
  const bones: THREE.Bone[] = [];
  const fingers: THREE.Bone[][] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const skinColor = new THREE.Color(skin);
  const nailColor = skinColor.clone().lerp(new THREE.Color(0xffe9df), 0.3);
  const shade = new THREE.Color();
  const baseZ = holding ? -0.054 : 0;
  const palmBone = new THREE.Bone();
  palmBone.name = "palm";
  bones.push(palmBone);

  const vertex = (
    x: number,
    y: number,
    z: number,
    first: number,
    second = first,
    mix = 0,
    light = 1,
    nail = false,
  ) => {
    positions.push(x, y, z);
    skinIndices.push(first, second, 0, 0);
    skinWeights.push(1 - mix, mix, 0, 0);
    shade.copy(nail ? nailColor : skinColor).multiplyScalar(light);
    colors.push(shade.r, shade.g, shade.b);
  };
  const connectRings = (start: number, rows: number, sides: number) => {
    for (let row = 0; row < rows - 1; row++) {
      for (let segment = 0; segment < sides; segment++) {
        const a = start + row * (sides + 1) + segment;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  };

  // The heel, thenar pad and knuckles share one gently tapered surface.
  const palmRings = [
    [-0.155, 0.028, 0.021],
    [-0.132, 0.032, 0.023],
    [-0.105, 0.034, 0.024],
    [-0.081, 0.041, 0.026],
    [-0.055, 0.055, 0.03],
    [-0.026, 0.065, 0.031],
    [0.001, 0.066, 0.028],
    [0.028, 0.064, 0.024],
    [0.048, 0.06, 0.021],
    [0.059, 0.052, 0.016],
    [0.067, 0.001, 0.002],
  ];
  const palmSides = 20;
  for (const [y, width, depth] of palmRings) {
    for (let segment = 0; segment <= palmSides; segment++) {
      const angle = (segment / palmSides) * Math.PI * 2;
      const roundness = Math.pow(Math.abs(Math.cos(angle)), 0.84) * Math.sign(Math.cos(angle));
      const x = roundness * width;
      const thumbPad = Math.max(0, (x * side) / 0.066) * Math.exp(-(((y + 0.025) / 0.049) ** 2));
      vertex(
        x,
        y,
        baseZ + Math.sin(angle) * depth + thumbPad * 0.006,
        0,
        0,
        0,
        0.96 + Math.max(0, Math.sin(angle)) * 0.04,
      );
    }
  }
  connectRings(0, palmRings.length, palmSides);

  const makeDigit = (
    name: string,
    x: number,
    y: number,
    z: number,
    lengths: readonly number[],
    radius: number,
    thumb = false,
  ) => {
    const chain: THREE.Bone[] = [];
    const boneStart = bones.length;
    for (let joint = 0; joint < 3; joint++) {
      const bone = new THREE.Bone();
      bone.name = `${name}-${joint}`;
      if (joint === 0) {
        bone.position.set(x, y, z);
        palmBone.add(bone);
      } else {
        bone.position.y = lengths[joint - 1];
        chain[joint - 1].add(bone);
      }
      bones.push(bone);
      chain.push(bone);
    }
    const length = lengths[0] + lengths[1] + lengths[2];
    const digitRows = 19;
    const digitSides = 10;
    const start = positions.length / 3;
    for (let row = 0; row < digitRows; row++) {
      const along = (row / (digitRows - 1)) * (length + radius * 0.55);
      const t = along / length;
      const feather = radius * 0.9;
      let previous = 0;
      let joint = 0;
      let blend = 0;
      for (let boundary = 1; boundary <= 2; boundary++) {
        const offset = boundary === 1 ? lengths[0] : lengths[0] + lengths[1];
        if (along > offset + feather) {
          previous = joint = boundary;
          blend = 0;
        } else if (along >= offset - feather) {
          previous = boundary - 1;
          joint = boundary;
          blend = THREE.MathUtils.smoothstep(along, offset - feather, offset + feather);
        }
      }
      const tip = clamp((length + radius * 0.55 - along) / (radius * 1.05), 0, 1);
      const width = radius * (1 - Math.min(t, 1) * 0.18) * Math.sqrt(tip);
      const knuckle = 1 + Math.exp(-(((along - lengths[0]) / (radius * 0.8)) ** 2)) * 0.05;
      for (let segment = 0; segment <= digitSides; segment++) {
        const angle = (segment / digitSides) * Math.PI * 2;
        vertex(
          x + Math.cos(angle) * width * knuckle,
          y + along,
          z + Math.sin(angle) * width * 0.85,
          boneStart + previous,
          boneStart + joint,
          previous === joint ? 0 : blend,
          0.97 + Math.max(0, Math.sin(angle)) * 0.03,
          !thumb && t > 0.72 && t < 0.95 && Math.sin(angle) < -0.58,
        );
      }
    }
    connectRings(start, digitRows, digitSides);
    return chain;
  };

  const digitLengths = [0.083, 0.096, 0.089, 0.069];
  for (let finger = 0; finger < 4; finger++) {
    const length = digitLengths[finger];
    fingers.push(
      makeDigit(
        ["index", "middle", "ring", "little"][finger],
        side * (0.045 - finger * 0.03),
        finger === 3 ? 0.043 : finger === 0 ? 0.049 : 0.054,
        baseZ - (holding ? 0.008 : 0),
        [length * 0.46, length * 0.31, length * 0.23],
        finger === 3 ? 0.0104 : 0.0127,
      ),
    );
  }
  const thumb = makeDigit(
    "thumb",
    side * 0.047,
    -0.004,
    baseZ + 0.015,
    [0.046, 0.041, 0.03],
    0.017,
    true,
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.72,
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = "articulated-hand";
  mesh.castShadow = mesh.receiveShadow = true;
  // Small moving digits must not be culled against their unposed bind bounds.
  mesh.frustumCulled = false;
  mesh.add(palmBone);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  geometry.addEventListener("dispose", () => skeleton.dispose());
  root.add(mesh);

  const relaxed = [0.24, 0.3, 0.35, 0.4];
  const grip = [0.13, 0.16, 0.18, 0.2];
  const defaultCurls = holding ? grip : relaxed;
  const defaultThumb = holding ? 0.78 : 0.25;
  const defaultSpread = holding ? 0.06 : 0.14;
  // Only the last part of a curl closes the fist: relaxed fingers and the card
  // pinch retain their approved joint angles. The pads finish against the palm
  // instead of hanging downward from almost straight proximal phalanges.
  const closedKnuckles = [1.5, 1.56, 1.6, 1.64];
  const closedMiddle = [1.65, 1.72, 1.7, 1.55];
  const closedTips = [0.62, 0.6, 0.61, 0.55];
  const pose = (
    curls: readonly number[],
    spread: number,
    thumbCurl: number,
    weight: number,
    thumbsUp = 0,
  ) => {
    const blend = clamp(weight, 0, 1);
    const approval = clamp(thumbsUp, 0, 1) * blend;
    // A fist is shorter through the metacarpals; keep its wrist anchor fixed.
    palmBone.scale.y = 1 - approval * 0.14;
    palmBone.position.y = -0.14 * approval * 0.14;
    // A card pinch sits behind its card plane; empty-hand gestures use the same
    // palm centre on both sides so opposed palms can actually meet when clapping.
    root.position.z = holding ? -baseZ * blend : 0;
    const fan = THREE.MathUtils.lerp(defaultSpread, clamp(spread, 0, 1), blend);
    for (let finger = 0; finger < fingers.length; finger++) {
      const curl = THREE.MathUtils.lerp(
        defaultCurls[finger],
        clamp(curls[finger] ?? 0.3, 0, 1),
        blend,
      );
      const closure = THREE.MathUtils.smoothstep(curl, 0.55, 1);
      const fist = THREE.MathUtils.lerp(closure, 1, approval);
      const chain = fingers[finger];
      // Slight adduction removes the open-hand gaps without changing bone length.
      chain[0].position.x = side * (0.045 - finger * 0.03) * (1 - fist * 0.055);
      chain[0].rotation.set(
        THREE.MathUtils.lerp(curl * 1.05, closedKnuckles[finger], fist),
        0,
        -side * (1.5 - finger) * fan * (1 - fist) * 0.2,
      );
      chain[1].rotation.x = THREE.MathUtils.lerp(curl * 1.3, closedMiddle[finger], fist);
      chain[2].rotation.x = THREE.MathUtils.lerp(curl * 0.85, closedTips[finger], fist);
    }
    const opposition = clamp(thumbCurl, 0, 1);
    // Holding is a separate rest pose; full gestures still share the same anatomy
    // on both hands, including a closed fist when the cards are temporarily hidden.
    thumb[0].rotation.set(
      THREE.MathUtils.lerp(
        holding ? 0.35 : 0.08 + defaultThumb * 0.47,
        0.08 + opposition * 0.47,
        blend,
      ),
      -side * 0.16,
      side *
        THREE.MathUtils.lerp(
          holding ? -0.7 + defaultThumb * 1.08 : -0.3 + defaultThumb * 1.25,
          -0.3 + opposition * 1.25,
          blend,
        ),
    );
    thumb[1].rotation.set(
      THREE.MathUtils.lerp(
        holding ? 0.24 + defaultThumb * 0.24 : 0.08 + defaultThumb * 0.62,
        0.08 + opposition * 0.62,
        blend,
      ),
      0,
      side * THREE.MathUtils.lerp(defaultThumb, opposition, blend) * 0.12,
    );
    thumb[2].rotation.x = 0.12 + THREE.MathUtils.lerp(defaultThumb, opposition, blend) * 0.3;
    // The thumb opens across the palm, perpendicular to the folded fingers.
    // Rolling the fist in the arm pose then points the thumb upward. Extending
    // it along the finger axis instead reads as an index finger pointing up.
    thumb[0].position.set(side * 0.047, -0.004, baseZ + 0.015);
    thumb[0].scale.set(1 + approval * 0.22, 1 - approval * 0.28, 1 + approval * 0.22);
    thumb[0].rotation.set(
      THREE.MathUtils.lerp(thumb[0].rotation.x, 0.02, approval),
      THREE.MathUtils.lerp(thumb[0].rotation.y, -side * 0.25, approval),
      THREE.MathUtils.lerp(thumb[0].rotation.z, -side * 0.95, approval),
    );
    thumb[1].rotation.set(
      THREE.MathUtils.lerp(thumb[1].rotation.x, -0.12, approval),
      0,
      THREE.MathUtils.lerp(thumb[1].rotation.z, -side * 0.1, approval),
    );
    thumb[2].rotation.x = THREE.MathUtils.lerp(thumb[2].rotation.x, 0.1, approval);
  };
  const reset = () => pose(defaultCurls, defaultSpread, defaultThumb, 0);
  reset();
  return { root, pose, reset };
}
