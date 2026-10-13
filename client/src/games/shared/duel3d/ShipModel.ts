import * as THREE from "three";
import { getShipSkin, type ShipSkinId } from "../../../../../shared/games/battleship/skins";
import { roundedPart } from "../table3d/AvatarParts";

type Point = [number, number, number];
export interface DuelShipRig {
  root: THREE.Group;
  animated: boolean;
  frame: (seconds: number, reduced: boolean) => void;
}

/** Fleet silhouettes and details follow the canonical ShipArtwork, including the sea dragon. */
export function makeDuelShip(
  length: number,
  skinId: ShipSkinId | undefined,
  sunk: boolean,
): DuelShipRig {
  const skin = getShipSkin(skinId);
  const root = new THREE.Group();
  const vessel = new THREE.Group();
  root.add(vessel);
  const span = length * 0.74 - 0.1;
  const ghost = skin.id === "corsair";
  const dragon = skin.id === "royal";
  const north = skin.id === "arctic";
  const coastal = skin.id === "coastal";
  const moving: ((t: number) => void)[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string, glow = 0, opacity = 1) => {
    const key = `${color}:${glow}:${opacity}`;
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color: sunk ? new THREE.Color(color).lerp(new THREE.Color("#485664"), 0.7) : color,
          roughness: north ? 0.88 : 0.48,
          metalness: north ? 0 : 0.28,
          emissive: !sunk && glow ? color : "#000000",
          emissiveIntensity: sunk ? 0 : glow,
          transparent: opacity < 1,
          opacity,
          depthWrite: opacity === 1,
          side: THREE.DoubleSide,
        }),
      );
    return materials.get(key)!;
  };
  const mesh = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: string,
    at: Point,
    glow = 0,
  ) => {
    const part = new THREE.Mesh(geometry, material(color, glow));
    part.position.set(...at);
    parent.add(part);
    return part;
  };
  const box = (parent: THREE.Object3D, size: Point, color: string, at: Point) => {
    const part = roundedPart(size, material(color), Math.min(...size) * 0.2);
    part.position.set(...at);
    parent.add(part);
    return part;
  };
  const sphere = (parent: THREE.Object3D, size: Point, color: string, at: Point, glow = 0) => {
    const part = mesh(parent, new THREE.SphereGeometry(1, 12, 8), color, at, glow);
    part.scale.set(...size);
    return part;
  };
  const rod = (parent: THREE.Object3D, a: Point, b: Point, radius: number, color: string) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b);
    const direction = to.clone().sub(from);
    const part = mesh(
      parent,
      new THREE.CylinderGeometry(radius, radius, direction.length(), 6),
      color,
      [0, 0, 0],
    );
    part.position.copy(from.add(to).multiplyScalar(0.5));
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return part;
  };
  const tube = (parent: THREE.Object3D, points: Point[], radius: number, color: string, glow = 0) =>
    mesh(
      parent,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
        20,
        radius,
        6,
        false,
      ),
      color,
      [0, 0, 0],
      glow,
    );
  const outline = (size: number, breadth: number, y: number): Point[] => {
    const h = size / 2,
      w = breadth / 2;
    return [
      [-h, y, -w * 0.35],
      [-h * 0.8, y, -w * 0.85],
      [0, y, -w],
      [h * 0.65, y, -w * 0.65],
      [h, y, 0],
      [h * 0.65, y, w * 0.65],
      [0, y, w],
      [-h * 0.8, y, w * 0.85],
      [-h, y, w * 0.35],
      [-h, y, -w * 0.35],
    ];
  };
  const hullSize = dragon ? span * 0.74 : span;
  const breadth = north ? 0.38 : 0.46;
  // Three rings create a tapered keel, curved sides and a distinct gunwale, not a box.
  const contour = outline(hullSize, breadth, 0).slice(0, -1);
  const positions: number[] = [],
    indices: number[] = [];
  for (const [scale, height] of [
    [0.62, 0.015],
    [0.94, 0.095],
    [1, 0.22],
  ])
    for (const [x, , z] of contour) positions.push(x * scale, height, z * scale);
  for (let ring = 0; ring < 2; ring++)
    for (let i = 0; i < contour.length; i++) {
      const a = ring * contour.length + i,
        b = ring * contour.length + ((i + 1) % contour.length);
      indices.push(a, b, a + contour.length, b, b + contour.length, a + contour.length);
    }
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  hullGeometry.setIndex(indices);
  hullGeometry.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeometry, material(skin.hull, ghost ? 0.15 : 0));
  vessel.add(hull);
  const deckShape = new THREE.Shape();
  contour.forEach(([x, , z], i) =>
    i ? deckShape.lineTo(x * 0.94, -z * 0.94) : deckShape.moveTo(x * 0.94, -z * 0.94),
  );
  deckShape.closePath();
  const deck = mesh(vessel, new THREE.ShapeGeometry(deckShape), skin.deck, [0, 0.219, 0]);
  deck.rotation.x = -Math.PI / 2;
  tube(vessel, outline(hullSize, breadth, 0.225), 0.016, skin.trim, ghost ? 0.25 : 0);
  for (let i = 1; i < length * 3; i++) {
    const x = -hullSize * 0.4 + (hullSize * 0.8 * i) / (length * 3);
    rod(
      vessel,
      [x, 0.222, -breadth * 0.36],
      [x, 0.222, breadth * 0.36],
      0.005,
      north || dragon ? "#745238" : skin.detail,
    );
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < length + 1; i++) {
      const x = (i / length - 0.5) * hullSize * 0.62;
      sphere(
        vessel,
        [0.028, 0.026, 0.012],
        ghost ? skin.accent : skin.detail,
        [x, 0.14, side * breadth * 0.48],
        ghost ? 0.8 : 0,
      );
    }
  }

  const sail = (
    x: number,
    height: number,
    width: number,
    kind: "striped" | "torn" | "dragon",
    phase: number,
  ) => {
    const mast = new THREE.Group();
    mast.position.set(x, 0.23, 0);
    vessel.add(mast);
    rod(mast, [0, 0, 0], [0, height + 0.1, 0], 0.014, skin.trim);
    const canvas = new THREE.Group();
    canvas.position.y = height * 0.36;
    canvas.rotation.y = -0.66;
    mast.add(canvas);
    const verts: number[] = [],
      colors: number[] = [],
      faces: number[] = [];
    const columns = 12,
      rows = 6;
    for (let v = 0; v <= rows; v++)
      for (let u = 0; u <= columns; u++) {
        const s = u / columns,
          t = v / rows;
        const torn = kind === "torn" ? (u % 3 === 0 ? 0.17 : u % 3 === 1 ? -0.05 : 0.08) : 0;
        verts.push(
          Math.sin(s * Math.PI) * (0.09 + 0.04 * Math.sin(t * Math.PI)),
          height * 0.6 * t + torn * (1 - t),
          (s - 0.5) * width * (0.86 + 0.14 * t),
        );
        const color = new THREE.Color(
          kind === "striped"
            ? Math.floor(u / 2) % 2
              ? skin.accent
              : skin.trim
            : kind === "torn"
              ? skin.trim
              : skin.accent,
        );
        colors.push(color.r, color.g, color.b);
      }
    for (let v = 0; v < rows; v++)
      for (let u = 0; u < columns; u++) {
        // Missing pieces make the ghost sail visibly ragged instead of a recoloured square.
        if (kind === "torn" && ((v === 2 && u === 4) || (v === 3 && u === 8))) continue;
        const a = v * (columns + 1) + u,
          b = a + columns + 1;
        faces.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    const clothMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.92,
      color: sunk ? "#59616c" : "#ffffff",
      emissive: ghost && !sunk ? skin.accent : "#000000",
      emissiveIntensity: ghost && !sunk ? 0.4 : 0,
      transparent: ghost,
      opacity: ghost ? 0.78 : 1,
    });
    canvas.add(new THREE.Mesh(geometry, clothMaterial));
    rod(
      canvas,
      [0, height * 0.6, -width * 0.55],
      [0, height * 0.6, width * 0.55],
      0.012,
      skin.trim,
    );
    if (kind === "dragon") {
      for (const side of [-1, 1])
        tube(
          canvas,
          [
            [0, 0, side * width * 0.43],
            [0.09, height * 0.3, side * width * 0.46],
            [0, height * 0.6, side * width * 0.5],
          ],
          0.009,
          skin.trim,
        );
      const gem = mesh(
        canvas,
        new THREE.OctahedronGeometry(0.062),
        skin.trim,
        [0.12, height * 0.32, 0],
        0.2,
      );
      gem.scale.set(0.22, 1.4, 0.8);
    }
    if (kind === "torn") {
      sphere(canvas, [0.025, 0.052, 0.054], skin.detail, [0.13, height * 0.32, 0]);
      for (const side of [-1, 1])
        sphere(canvas, [0.014, 0.015, 0.013], skin.trim, [0.154, height * 0.33, side * 0.025], 0.6);
    }
    moving.push((t) => {
      canvas.rotation.y = -0.66 + Math.sin(t * 1.7 + phase) * 0.09;
      canvas.rotation.z = Math.sin(t * 2 + phase) * 0.025;
    });
    rod(
      mast,
      [0, height + 0.04, 0],
      [-Math.min(hullSize * 0.34, 0.32), 0.01, 0],
      0.004,
      skin.detail,
    );
  };

  if (north) {
    // Clinker strakes, alternating shields, oars and curled stems identify the northern fleet.
    for (const y of [0.065, 0.12, 0.18])
      tube(vessel, outline(hullSize * (0.78 + y), breadth * (0.78 + y), y), 0.009, skin.detail);
    for (const side of [-1, 1])
      for (let i = 0; i < length + 1; i++) {
        const x = (i / length - 0.5) * hullSize * 0.64;
        rod(vessel, [x + 0.055, 0.24, side * 0.08], [x - 0.06, 0.1, side * 0.31], 0.009, skin.deck);
        const blade = box(vessel, [0.034, 0.02, 0.085], skin.trim, [x - 0.066, 0.08, side * 0.31]);
        blade.rotation.y = -side * 0.25;
        const shield = mesh(
          vessel,
          new THREE.CylinderGeometry(0.065, 0.065, 0.018, 12),
          i % 2 ? skin.trim : skin.accent,
          [x, 0.23, side * 0.21],
        );
        shield.rotation.x = Math.PI / 2;
        sphere(vessel, [0.018, 0.018, 0.01], skin.detail, [x, 0.23, side * 0.223]);
        rod(
          vessel,
          [x - 0.047, 0.23, side * 0.225],
          [x + 0.047, 0.23, side * 0.225],
          0.004,
          skin.detail,
        );
      }
    for (const end of [-1, 1])
      tube(
        vessel,
        [
          [end * hullSize * 0.43, 0.2, 0],
          [end * hullSize * 0.48, 0.34, 0],
          [end * hullSize * 0.42, 0.44, 0],
          [end * hullSize * 0.35, 0.41, 0],
        ],
        0.025,
        skin.trim,
      );
    sail(0, length === 1 ? 0.48 : 0.78, length === 1 ? 0.35 : 0.59, "striped", length);
    if (length >= 3) sail(-span * 0.3, 0.48, 0.3, "striped", length + 1);
  } else if (ghost) {
    // Broken ribs and cabin, torn translucent canvas and cold lanterns, with no Viking shields.
    for (let i = 0; i < length * 2; i++) {
      const x = (i / (length * 2 - 1) - 0.5) * span * 0.75;
      for (const side of [-1, 1])
        rod(
          vessel,
          [x, 0.08, side * 0.14],
          [x - 0.025, 0.28 + (i % 2) * 0.05, side * 0.21],
          0.012,
          skin.trim,
        );
    }
    if (length > 1) {
      box(vessel, [span * 0.18, 0.22, 0.32], skin.detail, [-span * 0.33, 0.32, 0]);
      box(vessel, [span * 0.22, 0.03, 0.37], skin.hull, [-span * 0.33, 0.45, 0]);
      for (const side of [-1, 1])
        for (let j = 0; j < 2; j++)
          box(vessel, [0.038, 0.055, 0.015], skin.accent, [
            -span * 0.36 + j * 0.065,
            0.35,
            side * 0.166,
          ]);
    }
    sail(
      length === 1 ? -0.06 : span * 0.06,
      length === 1 ? 0.55 : 0.85,
      length === 1 ? 0.38 : 0.55,
      "torn",
      1,
    );
    if (length >= 3) sail(-span * 0.24, 0.68, 0.44, "torn", 3);
    if (length === 4) sail(span * 0.32, 0.56, 0.35, "torn", 5);
    rod(vessel, [span * 0.3, 0.26, 0], [span * 0.49, 0.36, 0], 0.015, skin.trim);
    for (const side of [-1, 1]) {
      const lantern = sphere(
        vessel,
        [0.028, 0.046, 0.028],
        skin.accent,
        [-span * 0.4, 0.49, side * 0.16],
        1.7,
      );
      moving.push((t) => {
        const pulse = 0.9 + Math.sin(t * 2.1 + side) * 0.12;
        lantern.scale.set(0.028 * pulse, 0.046 * pulse, 0.028 * pulse);
      });
      // A thin ghost wake is readable even without postprocessing bloom.
      const wake = tube(
        root,
        [
          [-span * 0.4, 0.035, side * 0.27],
          [0, 0.035, side * 0.3],
          [span * 0.4, 0.035, side * 0.25],
        ],
        0.008,
        skin.accent,
        0.65,
      );
      moving.push((t) => {
        wake.position.y = Math.sin(t * 1.3 + side) * 0.013;
      });
    }
  } else if (dragon) {
    const h = span / 2;
    // Sculpted neck, jaw, horns, slit eyes and articulated purple fins follow the sea-dragon art.
    const head = new THREE.Group();
    head.position.set(h * 0.68, 0.22, 0);
    head.scale.setScalar(length === 1 ? 0.68 : length === 2 ? 1.15 : 1.35);
    vessel.add(head);
    tube(
      head,
      [
        [-0.09, -0.02, 0],
        [-0.1, 0.14, 0],
        [-0.07, 0.3, 0],
        [0.035, 0.36, 0],
      ],
      0.065,
      skin.hull,
    );
    sphere(head, [0.105, 0.092, 0.092], skin.hull, [0.005, 0.36, 0]);
    sphere(head, [0.1, 0.05, 0.067], skin.hull, [0.075, 0.325, 0]);
    sphere(head, [0.085, 0.016, 0.053], skin.trim, [0.07, 0.283, 0]);
    for (const side of [-1, 1]) {
      tube(
        head,
        [
          [-0.048, 0.412, side * 0.052],
          [-0.09, 0.5, side * 0.069],
          [-0.11, 0.55, side * 0.065],
        ],
        0.015,
        skin.trim,
      );
      sphere(head, [0.04, 0.026, 0.009], "#ffd568", [0.044, 0.376, side * 0.079], 0.85);
      sphere(head, [0.006, 0.021, 0.011], skin.detail, [0.052, 0.376, side * 0.085]);
      sphere(head, [0.012, 0.009, 0.006], skin.detail, [0.133, 0.337, side * 0.04]);
      const fang = mesh(head, new THREE.ConeGeometry(0.011, 0.035, 6), "#fff1c2", [
        0.107,
        0.292,
        side * 0.046,
      ]);
      fang.rotation.z = Math.PI;
      tube(
        head,
        [
          [-0.065, 0.29, side * 0.058],
          [-0.035, 0.2, side * 0.069],
          [-0.066, 0.075, side * 0.065],
        ],
        0.007,
        skin.trim,
      );
    }
    moving.push((t) => {
      head.rotation.z = Math.sin(t * 1.8) * 0.065;
      head.rotation.y = Math.sin(t * 0.9) * 0.07;
    });
    const tail = new THREE.Group();
    tail.position.set(-h * 0.68, 0.19, 0);
    vessel.add(tail);
    tube(
      tail,
      [
        [0, 0, 0],
        [-h * 0.18, 0.045, 0.07],
        [-h * 0.22, 0.15, 0.04],
        [-h * 0.12, 0.18, -0.03],
        [-h * 0.08, 0.12, -0.035],
      ],
      0.021,
      skin.trim,
    );
    moving.push((t) => {
      tail.rotation.x = Math.sin(t * 1.6) * 0.15;
    });
    for (const x of length < 3 ? [-span * 0.12] : [-span * 0.25, span * 0.13])
      for (const side of [-1, 1]) {
        const fin = new THREE.Group();
        fin.position.set(x, 0.17, side * 0.15);
        vessel.add(fin);
        const points: Point[] = [
          [-0.13, 0, 0],
          [-0.16, 0.14, side * 0.1],
          [-0.075, 0.34, side * 0.13],
          [0.005, 0.19, side * 0.09],
          [0.13, 0.27, side * 0.12],
          [0.095, 0, 0],
          [-0.13, 0, 0],
        ];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(points.slice(0, -1).flat(), 3),
        );
        geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 5, 3, 4, 5]);
        geometry.computeVertexNormals();
        fin.add(new THREE.Mesh(geometry, material(skin.accent)));
        tube(fin, points, 0.008, skin.trim);
        rod(fin, [-0.075, 0.34, side * 0.13], [-0.015, 0, 0], 0.005, skin.trim);
        moving.push((t) => {
          fin.rotation.x = side * (Math.sin(t * 2.2 + x) * 0.23);
        });
      }
    sail(-span * 0.04, length === 1 ? 0.48 : 0.77, length === 1 ? 0.32 : 0.52, "dragon", 0);
    if (length >= 3) sail(-span * 0.27, 0.6, 0.36, "dragon", 2);
    if (length === 4) sail(span * 0.2, 0.52, 0.32, "dragon", 4);
    // Two travelling ocean crests and foam particles stay inside the occupied row of cells.
    for (const side of [-1, 1])
      for (let layer = 0; layer < 2; layer++) {
        const points = Array.from({ length: 17 }, (_, i): Point => {
          const s = i / 16;
          return [
            (s - 0.5) * span * 0.96,
            0.025,
            side * (0.26 + layer * 0.032 + Math.sin(s * Math.PI * 4) * 0.026),
          ];
        });
        const wave = tube(
          root,
          points,
          layer ? 0.005 : 0.011,
          layer ? "#e2fff3" : "#6be8dc",
          layer ? 0.65 : 0.85,
        );
        moving.push((t) => {
          wave.position.x = Math.sin(t * 1.9 + layer + side) * 0.025;
          wave.scale.z = 0.97 + Math.sin(t * 2 + layer) * 0.045;
        });
      }
    for (let i = 0; i < 8; i++) {
      const foam = sphere(root, [0.012, 0.012, 0.012], "#c5fff0", [0, 0.04, 0], 0.8);
      moving.push((t) => {
        const phase = (t * 0.16 + i / 8) % 1;
        foam.position.set(
          (0.5 - phase) * span * 0.87,
          0.04 + Math.sin(phase * Math.PI) * 0.045,
          (i % 2 ? 1 : -1) * 0.29,
        );
        foam.scale.setScalar(0.012 * Math.sin(phase * Math.PI));
      });
    }
  } else {
    // Conventional fleets retain the same naval family, with a rescue cabin vs armoured turrets.
    const bridgeX = -span * 0.12;
    box(vessel, [Math.min(span * 0.34, 0.48), 0.2, 0.3], coastal ? skin.trim : skin.hull, [
      bridgeX,
      0.32,
      0,
    ]);
    box(vessel, [Math.min(span * 0.38, 0.53), 0.035, 0.34], skin.trim, [bridgeX, 0.44, 0]);
    for (const side of [-1, 1]) {
      box(
        vessel,
        [Math.min(span * 0.25, 0.32), 0.065, 0.012],
        coastal ? skin.accent : skin.detail,
        [bridgeX + 0.015, 0.365, side * 0.156],
      );
      // Raised guardrails with individual stanchions.
      rod(
        vessel,
        [-span * 0.38, 0.31, side * 0.18],
        [span * 0.25, 0.31, side * 0.18],
        0.006,
        skin.trim,
      );
      for (let i = 0; i < length + 1; i++)
        rod(
          vessel,
          [-span * 0.38 + (span * 0.63 * i) / length, 0.23, side * 0.18],
          [-span * 0.38 + (span * 0.63 * i) / length, 0.31, side * 0.18],
          0.005,
          skin.trim,
        );
    }
    rod(vessel, [bridgeX, 0.46, 0], [bridgeX, 0.71, 0], 0.012, skin.detail);
    rod(vessel, [bridgeX, 0.66, -0.09], [bridgeX, 0.66, 0.09], 0.009, skin.trim);
    if (coastal) {
      sphere(vessel, [0.027, 0.028, 0.027], skin.accent, [bridgeX, 0.5, 0], 0.45);
      for (const side of [-1, 1]) {
        const buoy = mesh(vessel, new THREE.TorusGeometry(0.054, 0.014, 6, 12), skin.trim, [
          -span * 0.27,
          0.3,
          side * 0.22,
        ]);
        buoy.rotation.y = 0;
        for (const dy of [-0.046, 0.046])
          box(vessel, [0.03, 0.019, 0.033], skin.hull, [-span * 0.27, 0.3 + dy, side * 0.22]);
      }
      if (length > 1)
        box(vessel, [Math.min(0.3, span * 0.2), 0.07, 0.22], skin.detail, [-span * 0.34, 0.26, 0]);
    } else if (length > 1) {
      for (const x of length >= 3 ? [span * 0.28, -span * 0.35] : [span * 0.28]) {
        mesh(vessel, new THREE.CylinderGeometry(0.095, 0.12, 0.085, 12), skin.hull, [x, 0.275, 0]);
        box(vessel, [0.14, 0.06, 0.13], skin.trim, [x, 0.33, 0]);
        for (const z of [-0.037, 0.037])
          rod(vessel, [x, 0.335, z], [x + 0.2, 0.35, z], 0.012, skin.detail);
      }
      box(vessel, [0.1, 0.17, 0.11], skin.detail, [-span * 0.13, 0.52, 0]);
    }
    box(vessel, [0.025, 0.12, 0.31], skin.accent, [-span * 0.45, 0.15, 0]);
  }
  if (sunk) {
    vessel.rotation.x = 0.16;
    vessel.position.y = -0.075;
  }
  root.traverse((part) => {
    if (part instanceof THREE.Mesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  const animated = !sunk && moving.length > 0;
  return {
    root,
    animated,
    frame(seconds, reduced) {
      if (sunk) return;
      const t = reduced ? 0 : seconds + length * 0.37;
      for (const animate of moving) animate(t);
      if (ghost || dragon) {
        vessel.position.y = reduced ? 0 : Math.sin(t * 1.6) * 0.012;
        vessel.rotation.x = reduced ? 0 : Math.sin(t * 1.4) * 0.025;
      }
    },
  };
}
