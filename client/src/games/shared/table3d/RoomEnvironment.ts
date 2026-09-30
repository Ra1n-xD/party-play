import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type RoomVariant = "durak" | "uno" | "bunker";
type Triple = [number, number, number];

/** Static scenery stays outside the largest table's chairs and shares a few material batches. */
export function makeRoomEnvironment(
  variant: RoomVariant,
  textures: Map<string, THREE.CanvasTexture>,
  anisotropy: number,
) {
  const room = new THREE.Group();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const pictureMaterials = new Map<THREE.Texture, THREE.MeshStandardMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const colors = {
    wall: variant === "uno" ? "#253e50" : variant === "bunker" ? "#34433d" : "#24443c",
    fabric: variant === "uno" ? 0x354e6d : variant === "bunker" ? 0x62644b : 0x486b5b,
    rug: variant === "uno" ? "#35495f" : variant === "bunker" ? "#485249" : "#653e43",
    brass: 0xb89a61,
    wood: 0x423024,
    cream: 0xe8d7b5,
  };
  const material = (color: number, roughness = 0.82, metalness = 0) => {
    const key = `${color}:${roughness}:${metalness}`;
    let result = materials.get(key);
    if (!result) {
      result = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.set(key, result);
    }
    return result;
  };
  const geometry = (key: string, create: () => THREE.BufferGeometry) => {
    if (!geometries.has(key)) geometries.set(key, create());
    return geometries.get(key)!;
  };
  const part = (
    parent: THREE.Object3D,
    shape: THREE.BufferGeometry,
    finish: THREE.Material,
    position: Triple,
    scale: Triple = [1, 1, 1],
  ) => {
    const mesh = new THREE.Mesh(shape, finish);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (parent: THREE.Object3D, size: Triple, color: number, position: Triple) =>
    part(
      parent,
      geometry("box", () => new THREE.BoxGeometry()),
      material(color),
      position,
      size,
    );
  const sphere = (parent: THREE.Object3D, size: Triple, color: number, position: Triple) =>
    part(
      parent,
      geometry("sphere", () => new THREE.SphereGeometry(1, 16, 12)),
      material(color),
      position,
      size,
    );
  const cylinder = (
    parent: THREE.Object3D,
    radius: number,
    height: number,
    color: number,
    position: Triple,
  ) =>
    part(
      parent,
      geometry("cylinder", () => new THREE.CylinderGeometry(1, 1, 1, 24)),
      material(color),
      position,
      [radius, height, radius],
    );
  const ring = (parent: THREE.Object3D, radius: number, tube: number, position: Triple) =>
    part(
      parent,
      geometry(`ring:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 6, 48)),
      material(colors.brass, 0.48, 0.45),
      position,
    );
  const texture = (
    key: string,
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ) => {
    const cacheKey = `room:${variant}:${key}`;
    if (textures.has(cacheKey)) return textures.get(cacheKey)!;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d")!);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = anisotropy;
    textures.set(cacheKey, result);
    return result;
  };
  const picture = (
    parent: THREE.Object3D,
    map: THREE.Texture,
    width: number,
    height: number,
    position: Triple,
    luminous = false,
  ) => {
    let finish = pictureMaterials.get(map);
    if (!finish) {
      finish = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
      if (luminous) {
        finish.emissive.set(0xffffff);
        finish.emissiveMap = map;
        finish.emissiveIntensity = 0.42;
      }
      pictureMaterials.set(map, finish);
    }
    return part(
      parent,
      geometry("plane", () => new THREE.PlaneGeometry()),
      finish,
      position,
      [width, height, 1],
    );
  };
  const frame = (parent: THREE.Object3D, width: number, height: number, position: Triple) => {
    const [x, y, z] = position;
    box(parent, [width + 0.16, height + 0.16, 0.08], colors.wood, [x, y, z]);
    box(parent, [width + 0.08, height + 0.08, 0.04], colors.brass, [x, y, z + 0.06]);
  };

  const parquet = texture("parquet", 512, 512, (ctx) => {
    ctx.fillStyle = "#5c3d2c";
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++) {
      for (let column = -1; column < 3; column++) {
        const x = column * 256 + (row % 2) * 128;
        const y = row * 64;
        ctx.fillStyle = ["#6c4a34", "#765139", "#805b40", "#70503a"][(row + column + 4) % 4];
        ctx.fillRect(x + 1, y + 1, 254, 62);
        for (let grain = 0; grain < 16; grain++) {
          ctx.strokeStyle = grain % 2 ? "#27180f18" : "#ecd0a510";
          ctx.beginPath();
          ctx.moveTo(x, y + grain * 4);
          ctx.bezierCurveTo(
            x + 65,
            y + grain * 4 + 3,
            x + 150,
            y + grain * 4 - 3,
            x + 256,
            y + grain * 4,
          );
          ctx.stroke();
        }
      }
    }
  });
  parquet.wrapS = parquet.wrapT = THREE.RepeatWrapping;
  parquet.repeat.set(7, 7);
  const floor = box(room, [15.4, 0.12, 14.8], 0xffffff, [0, -0.07, 0]);
  floor.material = new THREE.MeshStandardMaterial({
    map: parquet,
    roughness: 0.88,
  });

  const rugMap = texture("rug", 1024, 1024, (ctx) => {
    ctx.fillStyle = colors.rug;
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = "#c5a978";
    for (const radius of [440, 452, 474]) {
      ctx.lineWidth = radius === 452 ? 2 : 5;
      ctx.beginPath();
      ctx.arc(512, 512, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 72; i++) {
      ctx.save();
      ctx.translate(512, 512);
      ctx.rotate((i * Math.PI * 2) / 72);
      ctx.strokeStyle = "#c5a97870";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, 458);
      ctx.lineTo(0, 468);
      ctx.lineTo(8, 458);
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 16; i++) {
      ctx.save();
      ctx.translate(512, 512);
      ctx.rotate((i * Math.PI * 2) / 16);
      ctx.strokeStyle = "#c5a97823";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 170);
      ctx.bezierCurveTo(65, 290, 45, 365, 0, 410);
      ctx.bezierCurveTo(-45, 365, -65, 290, 0, 170);
      ctx.stroke();
      ctx.restore();
    }
  });
  const rug = picture(room, rugMap, 12.3, 12.3, [0, 0.008, 0]);
  rug.geometry = geometry("rug", () => new THREE.CircleGeometry(0.5, 96));
  rug.rotation.x = -Math.PI / 2;

  const wallpaper = texture("wallpaper", 256, 512, (ctx) => {
    ctx.fillStyle = colors.wall;
    ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = "#d1b57616";
    ctx.lineWidth = 1.2;
    for (let row = -1; row < 5; row++)
      for (let column = -1; column < 3; column++) {
        const x = column * 128 + (row % 2) * 64;
        const y = row * 128;
        for (const inset of [0, 12, 24]) {
          ctx.beginPath();
          ctx.moveTo(x - 52 + inset, y + 60);
          ctx.lineTo(x, y - 38 + inset);
          ctx.lineTo(x + 52 - inset, y + 60);
          ctx.stroke();
        }
      }
  });
  wallpaper.wrapS = wallpaper.wrapT = THREE.RepeatWrapping;
  wallpaper.repeat.set(8, 2);
  const walls: THREE.Group[] = [];
  for (const [x, z, rotation] of [
    [0, -7.1, 0],
    [0, 7.1, Math.PI],
    [-7.6, 0, Math.PI / 2],
    [7.6, 0, -Math.PI / 2],
  ]) {
    const wall = new THREE.Group();
    wall.position.set(x, 0, z);
    wall.rotation.y = rotation;
    room.add(wall);
    walls.push(wall);
    box(wall, [15.4, 6.6, 0.15], 0x23332e, [0, 3.3, -0.1]);
    picture(wall, wallpaper, 15.2, 4.75, [0, 4.15, 0.005]);
    box(wall, [15.2, 1.72, 0.12], colors.wood, [0, 0.86, 0.08]);
    for (let i = -6; i <= 6; i++) {
      box(wall, [1.02, 1.4, 0.03], 0x624731, [i * 1.16, 0.85, 0.16]);
      box(wall, [0.94, 1.3, 0.03], 0x493628, [i * 1.16, 0.85, 0.18]);
    }
    for (const y of [0.13, 1.7, 1.79, 6.24]) {
      box(wall, [15.2, 0.07, 0.16], colors.wood, [0, y, 0.16]);
      box(wall, [15.2, 0.022, 0.03], colors.brass, [0, y + 0.025, 0.26]);
    }
    for (const x of [-6.98, -2.3, 2.3, 6.98])
      box(wall, [0.06, 4.37, 0.055], 0x7a6b4c, [x, 4, 0.035]);
  }
  box(room, [15.4, 0.18, 14.4], 0x263a32, [0, 6.56, 0]);
  for (const x of [-5, -1.67, 1.67, 5]) box(room, [0.12, 0.14, 14.2], colors.wood, [x, 6.4, 0]);
  for (const z of [-4.7, 0, 4.7]) box(room, [15.2, 0.14, 0.12], colors.wood, [0, 6.4, z]);

  const lampGlow = new THREE.MeshStandardMaterial({
    color: 0xe4c38a,
    emissive: 0xffc46b,
    emissiveIntensity: 0.65,
    roughness: 0.8,
  });
  const lamp = (parent: THREE.Object3D, x: number, y: number, z: number, standing = false) => {
    cylinder(parent, 0.12, 0.06, colors.brass, [x, y, z]);
    cylinder(parent, 0.022, 0.46, colors.brass, [x, y + 0.23, z]);
    const shade = part(
      parent,
      geometry("shade", () => new THREE.CylinderGeometry(0.17, 0.25, 0.32, 24)),
      material(colors.cream),
      [x, y + 0.54, z],
    );
    shade.material = lampGlow;
    cylinder(parent, 0.17, 0.022, colors.brass, [x, y + 0.705, z]);
    if (!standing) box(parent, [0.13, 0.48, 0.07], colors.brass, [x, y + 0.15, z - 0.25]);
  };
  const plant = (parent: THREE.Object3D, x: number, z: number, small = false) => {
    const pot = new THREE.Group();
    pot.position.set(x, small ? 1.36 : 0, z);
    pot.scale.setScalar(small ? 0.38 : 1);
    parent.add(pot);
    const vase = part(
      pot,
      geometry("pot", () => new THREE.CylinderGeometry(0.28, 0.22, 0.48, 24)),
      material(0x9a7854),
      [0, 0.24, 0],
    );
    vase.receiveShadow = true;
    ring(pot, 0.275, 0.018, [0, 0.46, 0]).rotation.x = Math.PI / 2;
    cylinder(pot, 0.017, 1.28, 0x4c5631, [0, 1.08, 0]);
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.4;
      const leaf = sphere(pot, [0.13, 0.4, 0.045], i % 2 ? 0x507354 : 0x789263, [
        Math.sin(angle) * 0.25,
        0.74 + i * 0.075,
        Math.cos(angle) * 0.25,
      ]);
      leaf.rotation.set(Math.cos(angle) * 0.65, angle, -Math.sin(angle) * 0.65);
    }
  };
  const consoleTable = (parent: THREE.Object3D, x: number, width: number) => {
    box(parent, [width, 0.09, 0.64], 0x78563a, [x, 1.32, 0.46]);
    box(parent, [width - 0.06, 0.28, 0.5], colors.wood, [x, 1.12, 0.42]);
    for (const side of [-1, 1]) {
      box(parent, [0.08, 1.0, 0.08], colors.wood, [x + side * (width / 2 - 0.12), 0.51, 0.64]);
      cylinder(parent, 0.026, 0.03, colors.brass, [
        x + side * width * 0.22,
        1.11,
        0.685,
      ]).rotation.x = Math.PI / 2;
    }
    box(parent, [width - 0.18, 0.025, 0.45], colors.brass, [x, 0.32, 0.42]);
  };

  const city = texture("city", 512, 768, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 768);
    sky.addColorStop(0, "#192e49");
    sky.addColorStop(1, "#607480");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 768);
    ctx.fillStyle = "#e8e4ca";
    ctx.beginPath();
    ctx.arc(374, 151, 37, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 25; i++) ctx.fillRect((i * 113 + 19) % 512, (i * 61 + 17) % 410, 2, 2);
    for (let i = 0; i < 16; i++) {
      const height = 100 + ((i * 73) % 220);
      const x = i * 36 - 20;
      ctx.fillStyle = i % 2 ? "#183040" : "#243e4b";
      ctx.fillRect(x, 768 - height, 40, height);
      for (let row = 0; row < height / 20 - 1; row++)
        for (let column = 0; column < 3; column++)
          if ((i + row * 7 + column) % 3) {
            ctx.fillStyle = (i + column) % 2 ? "#e0b573" : "#95b1b8";
            ctx.fillRect(x + 5 + column * 10, 778 - height + row * 20, 4, 7);
          }
    }
    ctx.fillStyle = "#c4d5d512";
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(135, 0);
    ctx.lineTo(335, 768);
    ctx.lineTo(220, 768);
    ctx.fill();
  });
  const back = walls[0];
  for (const x of [-4.7, 4.7]) {
    frame(back, 2.12, 3.02, [x, 3.7, 0.16]);
    picture(back, city, 2.06, 2.96, [x, 3.7, 0.265], true);
    box(back, [0.035, 2.96, 0.04], colors.brass, [x, 3.7, 0.285]);
    box(back, [2.06, 0.035, 0.04], colors.brass, [x, 3.53, 0.285]);
    box(back, [2.36, 0.095, 0.34], 0x98724d, [x, 2.15, 0.31]);
    for (const side of [-1, 1]) {
      const curtain = new THREE.PlaneGeometry(0.63, 3.3, 16, 16);
      geometries.set(`curtain:${x}:${side}`, curtain);
      const vertices = curtain.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const px = vertices.getX(i);
        const py = vertices.getY(i);
        vertices.setXYZ(i, px * (0.86 + Math.abs(py) * 0.12), py, Math.cos(px * 38) * 0.065);
      }
      curtain.computeVertexNormals();
      const fabric = material(0x734651);
      fabric.side = THREE.DoubleSide;
      part(back, curtain, fabric, [x + side * 1.34, 3.63, 0.39]);
      box(back, [0.57, 0.065, 0.17], colors.brass, [x + side * 1.34, 2.79, 0.39]);
    }
    box(back, [3.57, 0.065, 0.12], colors.brass, [x, 5.37, 0.39]);
    consoleTable(back, x, 2.08);
    lamp(back, x - 0.58, 1.36, 0.52, true);
    plant(back, x + 0.53, 0.47, true);
  }

  // The library fills the full central wall, with low storage instead of a floating shelf.
  box(back, [3.45, 4.16, 0.46], colors.wood, [0, 2.28, 0.29]);
  box(back, [3.13, 3.04, 0.03], 0x292a21, [0, 2.79, 0.54]);
  for (const x of [-1.7, 0, 1.7]) box(back, [0.09, 4.12, 0.58], 0x76563b, [x, 2.29, 0.39]);
  for (const y of [0.28, 1.33, 2.3, 3.32, 4.38])
    box(back, [3.62, 0.09, 0.7], 0x856344, [0, y, 0.39]);
  for (const x of [-0.86, 0.86]) {
    box(back, [1.54, 0.85, 0.05], 0x65462f, [x, 0.79, 0.58]);
    box(back, [1.38, 0.68, 0.04], colors.wood, [x, 0.79, 0.62]);
    sphere(back, [0.035, 0.035, 0.025], colors.brass, [x + (x < 0 ? 0.58 : -0.58), 0.82, 0.66]);
  }
  const bookColors = [0x99635c, 0x587969, 0xb79c66, 0x526981, 0x785b72];
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 18; i++) {
      const x = -1.5 + i * 0.177;
      if (Math.abs(x) < 0.15 || i % 7 === row + 1) continue;
      const height = 0.49 + ((i * 3 + row) % 4) * 0.08;
      const book = box(back, [0.125, height, 0.32], bookColors[(i + row) % bookColors.length], [
        x,
        1.39 + row * 1.02 + height / 2,
        0.54,
      ]);
      book.rotation.z = i % 6 === 0 ? 0.08 : 0;
      for (const band of [-0.32, 0.32])
        box(back, [0.1, 0.018, 0.012], colors.brass, [x, book.position.y + height * band, 0.708]);
    }
  const clubSign = texture("club-sign", 1024, 256, (ctx) => {
    ctx.fillStyle = colors.wall;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = "#ba9f6e";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, 996, 228);
    ctx.strokeRect(25, 25, 974, 206);
    ctx.fillStyle = "#e5d8ae";
    ctx.textAlign = "center";
    ctx.font = "56px Georgia";
    ctx.fillText("P A R T Y P L A Y", 512, 123);
    ctx.font = "20px sans-serif";
    ctx.fillText("КЛУБ БОЛЬШОЙ КОМПАНИИ", 512, 177);
  });
  picture(back, clubSign, 3.72, 0.93, [0, 5.02, 0.1]);
  for (const x of [-2.48, 2.48]) lamp(back, x, 3.24, 0.36);

  const art = (index: number) =>
    texture(`art:${index}`, 512, 640, (ctx) => {
      ctx.fillStyle = ["#385760", "#594753", "#58614f"][index];
      ctx.fillRect(0, 0, 512, 640);
      ctx.fillStyle = "#d4b785";
      ctx.beginPath();
      ctx.arc(256, 250, 146, Math.PI, 0);
      ctx.lineTo(402, 460);
      ctx.lineTo(110, 460);
      ctx.fill();
      ctx.fillStyle = "#243833";
      ctx.beginPath();
      ctx.arc(256, 250, 117, Math.PI, 0);
      ctx.lineTo(373, 460);
      ctx.lineTo(139, 460);
      ctx.fill();
      ctx.strokeStyle = "#d4b78580";
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.moveTo(256, 265);
        ctx.lineTo(115 + i * 35, 115 + Math.abs(i - 4) * 26);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(256, 344);
      ctx.rotate(-0.2);
      ctx.fillStyle = "#f1e5c9";
      ctx.beginPath();
      ctx.roundRect(-61, -87, 122, 174, 12);
      ctx.fill();
      ctx.fillStyle = index === 1 ? "#a35252" : "#314c46";
      ctx.textAlign = "center";
      ctx.font = "92px Georgia";
      ctx.fillText(["♠", "♦", "♣"][index], 0, 30);
      ctx.restore();
      ctx.fillStyle = "#e6d5ae";
      ctx.textAlign = "center";
      ctx.font = "22px Georgia";
      ctx.fillText(["ВЕЧЕР В КОМПАНИИ", "ЕЩЁ ОДНА ПАРТИЯ", "ЗА ОДНИМ СТОЛОМ"][index], 256, 555);
      ctx.strokeStyle = "#c3a674";
      ctx.strokeRect(24, 24, 464, 592);
    });
  for (const wall of walls.slice(2)) {
    for (const [index, x] of [-4.58, 0, 4.58].entries()) {
      frame(wall, 1.42, 1.78, [x, 3.85, 0.13]);
      picture(wall, art(index), 1.42, 1.78, [x, 3.85, 0.24]);
    }
    for (const x of [-2.28, 2.28]) lamp(wall, x, 3.18, 0.34);
    const sofa = new THREE.Group();
    sofa.position.set(0, 0, 0.52);
    wall.add(sofa);
    for (const x of [-1.25, 1.25]) box(sofa, [0.08, 0.34, 0.08], colors.brass, [x, 0.17, 0]);
    box(sofa, [2.83, 0.32, 0.7], colors.wood, [0, 0.43, 0]);
    sphere(sofa, [1.42, 0.59, 0.14], colors.fabric, [0, 1.03, -0.24]);
    for (const x of [-0.86, 0, 0.86]) {
      sphere(sofa, [0.47, 0.12, 0.39], colors.fabric, [x, 0.66, 0.06]);
      sphere(sofa, [0.35, 0.29, 0.07], x === 0 ? 0x997453 : 0x536b62, [
        x,
        1.04,
        -0.065,
      ]).rotation.z = x * 0.1;
    }
    for (const x of [-1.43, 1.43]) sphere(sofa, [0.14, 0.26, 0.4], colors.fabric, [x, 0.8, 0.03]);
    for (const x of [-4.58, 4.58]) {
      consoleTable(wall, x, 1.64);
      lamp(wall, x - 0.38, 1.36, 0.48, true);
      plant(wall, x + 0.4, 0.46, true);
      for (let i = 0; i < 3; i++)
        box(wall, [0.5 - i * 0.04, 0.075, 0.28], bookColors[i], [x, 0.4 + i * 0.08, 0.47]);
    }
  }

  // A finished entrance, framed art and consoles complete the fourth wall.
  const front = walls[1];
  frame(front, 2.0, 3.38, [0, 1.85, 0.16]);
  box(front, [1.9, 3.3, 0.06], 0x513a2a, [0, 1.85, 0.24]);
  for (const y of [0.82, 2.26]) {
    box(front, [1.64, 1.04, 0.04], colors.brass, [0, y, 0.29]);
    box(front, [1.57, 0.97, 0.04], colors.wood, [0, y, 0.32]);
  }
  sphere(front, [0.042, 0.042, 0.045], colors.brass, [-0.65, 1.57, 0.36]);
  picture(front, clubSign, 2.6, 0.65, [0, 4.18, 0.1]);
  for (const side of [-1, 1]) {
    const x = side * 4.6;
    frame(front, 2.14, 2.56, [x, 3.51, 0.12]);
    picture(front, art(side < 0 ? 0 : 2), 2.14, 2.56, [x, 3.51, 0.24]);
    consoleTable(front, x, 2.15);
    lamp(front, x, 1.36, 0.46, true);
    lamp(front, side * 2.25, 3.08, 0.35);
  }
  for (const x of [-6.05, 6.05]) for (const z of [-5.5, 5.5]) plant(room, x, z);

  // The light sources themselves are visible, but only the table light casts shadows.
  for (const x of [-1.55, 1.55]) {
    cylinder(room, 0.025, 1.18, colors.brass, [x, 5.79, 0]);
    const shade = part(
      room,
      geometry("pendant", () => new THREE.ConeGeometry(0.55, 0.34, 32, 1, true)),
      material(colors.brass, 0.5, 0.4),
      [x, 5.08, 0],
    );
    (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const diffuser = cylinder(room, 0.48, 0.025, colors.cream, [x, 4.91, 0]);
    diffuser.material = new THREE.MeshStandardMaterial({
      color: 0xffe7bc,
      emissive: 0xffd28a,
      emissiveIntensity: 0.8,
    });
    ring(room, 0.52, 0.025, [x, 4.94, 0]).rotation.x = Math.PI / 2;
    ring(room, 0.22, 0.018, [x, 6.44, 0]).rotation.x = Math.PI / 2;
  }

  // Bake transforms once. Books, panel mouldings and plants do not add hundreds of draw calls.
  room.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  room.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const finish = child.material as THREE.Material;
    if (!batches.has(finish)) batches.set(finish, []);
    batches.get(finish)!.push(child.geometry.clone().applyMatrix4(child.matrixWorld));
  });
  room.clear();
  for (const [finish, pieces] of batches) {
    const merged = mergeGeometries(pieces, false)!;
    pieces.forEach((piece) => piece.dispose());
    const mesh = new THREE.Mesh(merged, finish);
    mesh.receiveShadow = true;
    room.add(mesh);
  }
  geometries.forEach((shape) => shape.dispose());
  return room;
}
