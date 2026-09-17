import * as THREE from "three";
import {
  AVATAR_LOOK_INTERVAL_MS,
  AVATAR_LOOK_EXPIRY_MS,
  type AvatarLook,
  type AvatarLookEvent,
} from "../../../../../shared/platform/avatarLook";
import { TableLookControls, TABLE_DEFAULT_PITCH } from "./TableLookControls";
import { TableAvatarAnimator } from "./TableAvatarAnimator";
import type { RoomReactionEvent } from "../../../../../shared/platform/reactions";

export interface TablePerson {
  id: string;
  name: string;
  count: number;
  active: boolean;
  detail: string;
  isBot: boolean;
  traits?: { label: string; value: string; detail?: string; kind?: string; iconPath?: string }[];
  selected?: boolean;
  muted?: boolean;
  eliminated?: boolean;
  eliminatedAt?: number;
}

export interface TableCard {
  id: string;
  rank: string;
  suit: string;
  red: boolean;
  x: number;
  z: number;
  covered: boolean;
  sourceId: string;
  selectable: boolean;
  focused: boolean;
  color?: "red" | "yellow" | "green" | "blue" | "wild";
}

export interface RoundTableState {
  people: TablePerson[];
  viewerId: string | null;
  cards: TableCard[];
  deckCount: number;
  discardCount: number;
  trump: { rank: string; suit: string; red: boolean } | null;
  takeSeatId: string | null;
}

interface MovingCard {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.Material[]>;
  target: THREE.Vector3;
  removing: boolean;
}

export interface TableSceneOptions {
  variant?: "durak" | "uno" | "bunker";
  onSelectPerson?: (id: string) => void;
}

const PALETTE = [0x467c87, 0xca8652, 0x887ca5, 0x829d67, 0xba6c73, 0x627eb3];
const SKIN = [0xd4a07a, 0x9e694e, 0xe6bda0, 0xbc8b69];
const TABLE_Y = 1.44;
const RADIUS = 3.05;

/** Shared visual room. Receives only the public table projection, never opponents' hands. */
export class RoundTableScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.08, 60);
  private readonly room = new THREE.Group();
  private readonly players = new THREE.Group();
  private readonly pile = new THREE.Group();
  private readonly table = new THREE.Group();
  private readonly cards = new Map<string, MovingCard>();
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private readonly seatPositions = new Map<string, THREE.Vector3>();
  private readonly avatars = new Map<string, TableAvatarAnimator>();
  private readonly seenReactions = new Set<string>();
  private readonly labels = new Map<string, { node: HTMLDivElement; position: THREE.Vector3 }>();
  private readonly controls: TableLookControls;
  private readonly remoteLooks = new Map<string, AvatarLook & { receivedAt: number }>();
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly abort = new AbortController();
  private peopleKey = "";
  private pileKey = "";
  private yaw = 0;
  private pitch = TABLE_DEFAULT_PITCH;
  private lastLookSentAt = 0;
  private lastSentLook: AvatarLook = { yaw: 0, pitch: TABLE_DEFAULT_PITCH };
  private lastTime = 0;
  private disposed = false;
  private paused = false;
  private seatRadius = 3.55;

  constructor(
    private readonly host: HTMLDivElement,
    private readonly labelHost: HTMLDivElement,
    private readonly onLook: (look: AvatarLook) => void,
    onCursor: (visible: boolean) => void,
    private readonly onFailure: () => void,
    private readonly options: TableSceneOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Круглый 3D-стол. Q — курсор, R — посмотреть на стол.",
    );
    this.host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x172521);
    this.scene.fog = new THREE.Fog(0x172521, 12, 28);
    this.scene.add(this.room, this.players, this.pile, this.table);
    this.makeRoom();
    this.camera.position.set(0, 3.12, 4.4);
    this.pitch = options.variant === "bunker" ? -0.16 : TABLE_DEFAULT_PITCH;
    this.controls = new TableLookControls(this.renderer.domElement, onCursor, this.pitch);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        this.onFailure();
      },
      { signal: this.abort.signal },
    );
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private material(color: number, roughness = 0.8) {
    return new THREE.MeshStandardMaterial({ color, roughness });
  }

  private mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private box(
    parent: THREE.Object3D,
    size: [number, number, number],
    color: number,
    position: [number, number, number],
  ) {
    return this.mesh(parent, new THREE.BoxGeometry(...size), color, position);
  }

  private sphere(
    parent: THREE.Object3D,
    size: [number, number, number],
    color: number,
    position: [number, number, number],
  ) {
    const mesh = this.mesh(parent, new THREE.SphereGeometry(1, 24, 16), color, position);
    mesh.scale.set(...size);
    return mesh;
  }

  private cylinder(
    parent: THREE.Object3D,
    radius: number,
    height: number,
    color: number,
    position: [number, number, number],
  ) {
    return this.mesh(
      parent,
      new THREE.CylinderGeometry(radius, radius, height, 80),
      color,
      position,
    );
  }

  private ring(parent: THREE.Object3D, radius: number, tube: number, color: number, y: number) {
    const mesh = this.mesh(parent, new THREE.TorusGeometry(radius, tube, 8, 100), color, [0, y, 0]);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private surfaceTexture(kind: "wood" | "felt") {
    const cached = this.textures.get(kind);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = kind === "wood" ? "#775039" : "#366556";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 37;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < (kind === "wood" ? 180 : 18000); i++) {
      ctx.fillStyle = random() > 0.5 ? "#ffffff13" : "#00000016";
      if (kind === "wood") {
        const y = random() * 256;
        ctx.fillRect(0, y, 256, random() * 2 + 0.3);
        ctx.strokeStyle = "#24161028";
        ctx.beginPath();
        ctx.ellipse(random() * 256, y, 25 + random() * 60, 1 + random() * 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else ctx.fillRect(random() * 256, random() * 256, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(kind === "wood" ? 4 : 5, kind === "wood" ? 4 : 5);
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    this.textures.set(kind, texture);
    return texture;
  }

  private makeRoom() {
    this.scene.add(new THREE.HemisphereLight(0xd6d7de, 0x553728, 1.45));
    const key = new THREE.DirectionalLight(0xffdfad, 3.1);
    key.position.set(-1.5, 6, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -6;
    key.shadow.camera.right = key.shadow.camera.top = 6;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    const blue = new THREE.PointLight(0xa5c5e2, 24, 14, 2);
    blue.position.set(4.5, 4, -4);
    this.scene.add(blue);

    const floor = this.box(this.room, [22, 0.15, 22], 0xffffff, [0, -0.12, 0]);
    (floor.material as THREE.MeshStandardMaterial).map = this.surfaceTexture("wood");
    for (let i = -12; i <= 12; i++)
      this.box(this.room, [0.014, 0.003, 22], 0x211913, [i * 0.55, -0.043, 0]);
    this.cylinder(this.room, 4.65, 0.025, 0x4f3433, [0, -0.02, 0]);
    for (const radius of [4.25, 4.36, 4.54]) this.ring(this.room, radius, 0.013, 0xb28e61, 0);
    for (let i = 0; i < 48; i++) {
      const angle = (i * Math.PI) / 24;
      const ornament = this.box(this.room, [0.1, 0.012, 0.19], 0x9e7954, [
        Math.sin(angle) * 4.4,
        0.012,
        Math.cos(angle) * 4.4,
      ]);
      ornament.rotation.y = -angle;
    }
    this.box(this.room, [18, 6.5, 0.25], 0x243c38, [0, 3.2, -7]);
    for (const side of [-1, 1])
      this.box(this.room, [0.25, 6.5, 20], 0x263c39, [side * 7.6, 3.2, 0]);
    this.box(this.room, [18, 0.2, 20], 0x26302d, [0, 6.5, 0]);
    for (let i = -5; i <= 5; i++) {
      this.box(this.room, [1.1, 1.6, 0.1], 0x392c26, [i * 1.35, 0.84, -6.8]);
      this.box(this.room, [1.01, 1.43, 0.08], 0x463a30, [i * 1.35, 0.84, -6.7]);
      this.box(this.room, [0.035, 4.65, 0.08], 0x827252, [i * 1.35 + 0.66, 3.95, -6.8]);
    }
    for (const y of [0.12, 1.69, 1.77, 6.15])
      this.box(this.room, [17, 0.055, 0.16], 0xb08b55, [0, y, -6.65]);
    for (const side of [-1, 1]) {
      const wall = new THREE.Group();
      wall.position.x = side * 7.42;
      wall.rotation.y = (-side * Math.PI) / 2;
      this.room.add(wall);
      for (let i = -5; i <= 6; i++) {
        this.box(wall, [1.1, 1.6, 0.1], 0x392c26, [i * 1.35, 0.84, 0]);
        this.box(wall, [1.01, 1.43, 0.08], 0x463a30, [i * 1.35, 0.84, 0.09]);
        this.box(wall, [0.035, 4.65, 0.08], 0x827252, [i * 1.35 + 0.66, 3.95, 0]);
      }
      for (const y of [0.12, 1.69, 1.77, 6.15])
        this.box(wall, [19, 0.055, 0.16], 0xb08b55, [0, y, 0.12]);
      for (const [index, x] of [-4.1, 0, 4.1].entries()) {
        this.box(wall, [1.56, 2.05, 0.14], 0x99784c, [x, 3.48, 0.16]);
        this.box(wall, [1.38, 1.86, 0.1], 0x182f2d, [x, 3.48, 0.25]);
        const artwork = new THREE.Mesh(
          new THREE.PlaneGeometry(1.22, 0.85),
          new THREE.MeshBasicMaterial({
            map: this.textTexture(`wall-art-${index}`, ["♠", "♣", "♦"][index], "PARTYPLAY"),
            transparent: true,
          }),
        );
        artwork.position.set(x, 3.45, 0.31);
        wall.add(artwork);
      }
      for (const x of [-2.05, 2.05, 6.15]) {
        this.box(wall, [0.13, 0.74, 0.16], 0x997443, [x, 3.7, 0.16]);
        const shade = this.cylinder(wall, 0.2, 0.48, 0xeac996, [x, 3.88, 0.39]);
        (shade.material as THREE.MeshStandardMaterial).emissive.set(0x9d5c23);
        const glow = new THREE.PointLight(0xffbb70, 8, 5, 2);
        glow.position.set(x, 3.88, 0.8);
        wall.add(glow);
      }
    }
    for (const x of [-5.4, -1.8, 1.8, 5.4])
      this.box(this.room, [0.16, 0.2, 18], 0x4b3a2b, [x, 6.28, 0]);

    // Moonlit windows with brass mullions and gathered velvet curtains.
    for (const x of [-4.65, 4.65]) {
      this.box(this.room, [2.25, 3.28, 0.2], 0x97784e, [x, 3.62, -6.65]);
      const glass = this.box(this.room, [2.03, 3.06, 0.1], 0x193546, [x, 3.62, -6.49]);
      (glass.material as THREE.MeshStandardMaterial).emissive.set(0x1d354b);
      (glass.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
      for (let i = 0; i < 12; i++) {
        const skyline = this.box(
          this.room,
          [0.13 + (i % 3) * 0.07, 0.25 + (i % 4) * 0.19, 0.02],
          0x0b1e2c,
          [x - 0.94 + i * 0.17, 2.26 + (i % 4) * 0.06, -6.39],
        );
        skyline.castShadow = false;
      }
      const moon = this.sphere(this.room, [0.26, 0.26, 0.025], 0xb7d2da, [x + 0.48, 4.45, -6.37]);
      (moon.material as THREE.MeshStandardMaterial).emissive.set(0x6c8a96);
      this.box(this.room, [0.05, 3.12, 0.08], 0x9e8559, [x, 3.62, -6.32]);
      this.box(this.room, [2.08, 0.06, 0.08], 0x9e8559, [x, 3.6, -6.31]);
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++) {
          this.sphere(this.room, [0.12, 1.73, 0.15], i % 2 ? 0x56363b : 0x69424a, [
            x + side * (1.17 + i * 0.17),
            3.62,
            -6.25,
          ]);
        }
      this.box(this.room, [3.4, 0.07, 0.12], 0xb9975c, [x, 5.38, -6.18]);
    }

    // A lit cabinet, books, ceramics and the club sign anchor the back wall.
    this.box(this.room, [3.05, 2.3, 0.45], 0x372a22, [0, 2.45, -6.56]);
    for (const y of [1.34, 2.04, 2.76, 3.58])
      this.box(this.room, [3.16, 0.075, 0.62], 0x79583a, [0, y, -6.33]);
    const bookColors = [0x7e5144, 0x476559, 0xb39462, 0x3b4e67, 0x6d4858];
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 11; i++) {
        const height = 0.37 + ((i + row) % 3) * 0.085;
        const book = this.box(
          this.room,
          [0.12, height, 0.3],
          bookColors[(i + row) % bookColors.length],
          [-1.29 + i * 0.245, 1.4 + row * 0.72 + height / 2, -6.17],
        );
        book.rotation.z = (i % 4 === 0 ? 1 : 0) * 0.12;
        this.box(this.room, [0.095, 0.025, 0.014], 0xc6a26e, [
          book.position.x,
          book.position.y + height * 0.28,
          -6.008,
        ]);
      }
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.72),
      new THREE.MeshBasicMaterial({
        map: this.textTexture("club-sign", "PARTYPLAY", "THE ROUND TABLE CLUB"),
        transparent: true,
      }),
    );
    sign.position.set(0, 4.45, -6.64);
    this.room.add(sign);
    for (const x of [-2.45, 2.45]) {
      this.box(this.room, [0.13, 0.8, 0.16], 0x997443, [x, 3.85, -6.65]);
      const shade = this.cylinder(this.room, 0.22, 0.52, 0xeac996, [x, 4.06, -6.4]);
      (shade.material as THREE.MeshStandardMaterial).emissive.set(0x9d5c23);
      const glow = new THREE.PointLight(0xffbb70, 12, 5, 2);
      glow.position.set(x, 4.2, -5.8);
      this.scene.add(glow);
    }
    for (const x of [-6.3, 6.3]) {
      this.cylinder(this.room, 0.35, 0.65, 0x9b7850, [x, 0.34, -4.8]);
      for (let i = 0; i < 7; i++) {
        const leaf = this.sphere(this.room, [0.15, 0.83, 0.3], i % 2 ? 0x3c6750 : 0x587451, [
          x + Math.sin(i * 2) * 0.3,
          1.22 + (i % 2) * 0.25,
          -4.8 + Math.cos(i * 2) * 0.3,
        ]);
        leaf.rotation.z = Math.sin(i * 2) * 0.4;
      }
    }
    // Pendants stay above the sightline and do not cast a solid shadow onto the cards.
    for (const x of [-1.4, 1.4]) {
      this.cylinder(this.room, 0.018, 1.32, 0x322a23, [x, 5.76, 0]);
      const shade = this.mesh(
        this.room,
        new THREE.ConeGeometry(0.53, 0.35, 48, 1, true),
        0x9d7d4e,
        [x, 5, 0],
      );
      shade.castShadow = false;
      const glow = this.cylinder(this.room, 0.47, 0.025, 0xffddb0, [x, 4.83, 0]);
      glow.castShadow = false;
      (glow.material as THREE.MeshStandardMaterial).emissive.set(0xffc477);
      (glow.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
    }

    this.cylinder(this.table, 0.58, 1.25, 0x352720, [0, 0.62, 0]);
    this.cylinder(this.table, 1.2, 0.12, 0x352720, [0, 0.1, 0]);
    const wood = this.cylinder(this.table, RADIUS, 0.22, 0xffffff, [0, TABLE_Y - 0.12, 0]);
    (wood.material as THREE.MeshStandardMaterial).map = this.surfaceTexture("wood");
    this.ring(this.table, RADIUS - 0.02, 0.035, 0xb5925b, TABLE_Y - 0.11);
    this.ring(this.table, RADIUS - 0.12, 0.115, 0x352b26, TABLE_Y + 0.008);
    const felt = this.cylinder(this.table, RADIUS - 0.29, 0.025, 0xffffff, [0, TABLE_Y + 0.013, 0]);
    (felt.material as THREE.MeshStandardMaterial).map = this.surfaceTexture("felt");
    if (this.options.variant === "uno")
      (felt.material as THREE.MeshStandardMaterial).color.set(0x8aa8cf);
    if (this.options.variant === "bunker") {
      (felt.material as THREE.MeshStandardMaterial).color.set(0x829789);
      for (let i = -8; i <= 8; i++) {
        const span = Math.sqrt(2.5 ** 2 - (i * 0.28) ** 2) * 2;
        this.box(this.table, [span, 0.003, 0.008], 0x718777, [0, TABLE_Y + 0.03, i * 0.28]);
        this.box(this.table, [0.008, 0.003, span], 0x718777, [i * 0.28, TABLE_Y + 0.03, 0]);
      }
      this.ring(this.table, 1.4, 0.012, 0xc5ae76, TABLE_Y + 0.04);
    }
    this.ring(this.table, RADIUS - 0.35, 0.009, 0xc5ae76, TABLE_Y + 0.03);
    for (let i = 0; i < 48; i++) {
      const angle = (i * Math.PI) / 24;
      this.sphere(this.table, [0.018, 0.012, 0.018], 0xb6975c, [
        Math.sin(angle) * (RADIUS - 0.12),
        TABLE_Y + 0.118,
        Math.cos(angle) * (RADIUS - 0.12),
      ]);
    }
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.34),
      new THREE.MeshBasicMaterial({
        map: this.textTexture("table-mark", "PARTYPLAY", "EST. MMXXIV"),
        transparent: true,
        depthWrite: false,
      }),
    );
    badge.rotation.x = -Math.PI / 2;
    badge.position.set(0, TABLE_Y + 0.032, -1.38);
    this.table.add(badge);
  }

  private textTexture(key: string, title: string, subtitle: string) {
    const cached = this.textures.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#c3bb8d";
    ctx.textAlign = "center";
    ctx.font = "500 48px Georgia";
    ctx.fillText(title, 256, 67);
    ctx.font = "18px sans-serif";
    ctx.fillText(subtitle, 256, 108);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, texture);
    return texture;
  }

  private cardTexture(rank: string, suit: string, red: boolean, color?: TableCard["color"]) {
    const key = `${this.options.variant}:${rank}:${suit}:${color ?? ""}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = rank ? "#fff8e9" : "#284c62";
    ctx.fillRect(0, 0, 256, 360);
    ctx.strokeStyle = rank ? "#d7cebc" : "#b9a474";
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, 236, 340);
    if (color || this.options.variant === "uno") {
      const colors = {
        red: "#c83c43",
        yellow: "#dfb73c",
        green: "#359573",
        blue: "#377dc6",
        wild: "#262b39",
      };
      ctx.fillStyle = colors[color ?? "wild"];
      ctx.fillRect(13, 13, 230, 334);
      if (color === "wild") {
        ["#c83c43", "#dfb73c", "#359573", "#377dc6"].forEach((fill, index) => {
          ctx.fillStyle = fill;
          ctx.fillRect(25 + (index % 2) * 103, 77 + Math.floor(index / 2) * 103, 103, 103);
        });
      }
      ctx.strokeStyle = "#fff8e9";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(128, 180, 83, 131, 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#fff8e9";
      ctx.textAlign = "center";
      ctx.font = `bold ${rank.length > 2 ? 58 : 92}px sans-serif`;
      ctx.shadowColor = "#0008";
      ctx.shadowBlur = 5;
      ctx.fillText(rank || "UNO", 128, 211);
      ctx.shadowBlur = 0;
      if (rank) {
        ctx.font = "bold 38px sans-serif";
        ctx.fillText(rank, 55, 58);
        ctx.save();
        ctx.translate(256, 360);
        ctx.rotate(Math.PI);
        ctx.fillText(rank, 55, 58);
        ctx.restore();
      }
    } else if (!rank) {
      ctx.lineWidth = 1.5;
      ctx.save();
      ctx.beginPath();
      ctx.rect(18, 18, 220, 324);
      ctx.clip();
      for (let i = -360; i < 620; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 360, 360);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i - 360, 360);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#284c62";
      ctx.beginPath();
      ctx.arc(128, 180, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d6bf82";
      ctx.font = "62px Georgia";
      ctx.textAlign = "center";
      ctx.fillText("♠", 128, 201);
    } else {
      ctx.fillStyle = red ? "#b53838" : "#202b32";
      for (let i = 0; i < 2; i++) {
        ctx.save();
        if (i) {
          ctx.translate(256, 360);
          ctx.rotate(Math.PI);
        }
        ctx.font = "bold 58px Georgia";
        ctx.fillText(rank, 21, 66);
        ctx.font = "48px Georgia";
        ctx.fillText(suit, 22, 114);
        ctx.restore();
      }
      ctx.textAlign = "center";
      ctx.font = "118px Georgia";
      ctx.fillText(suit, 128, 218);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    this.textures.set(key, texture);
    return texture;
  }

  private makeCard(rank = "", suit = "", red = false, color?: TableCard["color"]) {
    const edge = this.material(0xe4dac4);
    const face = new THREE.MeshStandardMaterial({
      map: this.cardTexture(rank, suit, red, color),
      roughness: 0.85,
    });
    const back = new THREE.MeshStandardMaterial({
      map: this.cardTexture("", "", false),
      roughness: 0.85,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.012, 1.06), [
      edge,
      edge,
      face,
      back,
      edge,
      edge,
    ]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private makePerson(person: TablePerson, index: number, angle: number) {
    const group = new THREE.Group();
    group.position.set(Math.sin(angle) * this.seatRadius, 0, Math.cos(angle) * this.seatRadius);
    group.rotation.y = angle + Math.PI;
    group.userData.seatId = person.id;
    group.userData.isBot = person.isBot;
    this.players.add(group);
    this.seatPositions.set(person.id, group.position.clone().setY(2));
    const shirt = PALETTE[index % PALETTE.length];
    const skin = SKIN[index % SKIN.length];
    const hair = [0x392b24, 0x33251f, 0xb48a52, 0x2c282a, 0x694136, 0x74716a][index % 6];
    // Rounded, tufted leather chair with brass feet.
    this.sphere(group, [0.52, 0.16, 0.47], 0x47372f, [0, 0.76, -0.02]);
    this.sphere(group, [0.52, 0.7, 0.14], 0x493830, [0, 1.3, -0.4]);
    for (const x of [-0.24, 0, 0.24])
      for (const y of [1.1, 1.45])
        this.sphere(group, [0.025, 0.025, 0.016], 0x2c211b, [x, y, -0.254]);
    const body = new THREE.Group();
    body.position.y = 0.92;
    const model = new THREE.Group();
    model.position.y = -0.92;
    body.add(model);
    group.add(body);
    for (const side of [-1, 1]) {
      for (const z of [-0.28, 0.27])
        this.box(group, [0.055, 0.72, 0.055], 0x997847, [side * 0.35, 0.36, z]);
      this.sphere(model, [0.17, 0.16, 0.4], 0x252f33, [side * 0.21, 0.92, 0.28]);
      this.box(model, [0.23, 0.64, 0.22], 0x252f33, [side * 0.21, 0.54, 0.56]);
      this.sphere(model, [0.17, 0.095, 0.31], 0x241f1c, [side * 0.21, 0.18, 0.65]);
      this.box(model, [0.23, 0.025, 0.5], 0x171615, [side * 0.21, 0.12, 0.68]);
    }
    this.sphere(model, [0.4, 0.53, 0.265], shirt, [0, 1.45, 0]);
    this.sphere(model, [0.23, 0.41, 0.04], 0xe0d5ba, [0, 1.5, 0.253]);
    for (const side of [-1, 1]) {
      const lapel = this.box(model, [0.12, 0.45, 0.035], shirt, [side * 0.13, 1.65, 0.282]);
      lapel.rotation.z = -side * 0.31;
      const collar = this.box(model, [0.11, 0.13, 0.025], 0xf4e8ce, [side * 0.075, 1.89, 0.21]);
      collar.rotation.z = side * 0.43;
    }
    if (index % 2 === 0) {
      this.box(model, [0.065, 0.32, 0.025], index % 4 ? 0x8c6742 : 0x67464b, [0, 1.65, 0.309]);
      this.sphere(model, [0.04, 0.045, 0.022], 0x785748, [0, 1.84, 0.278]);
    }
    for (const y of [1.23, 1.39]) this.sphere(model, [0.018, 0.018, 0.01], 0xb79764, [0, y, 0.275]);
    this.box(model, [0.12, 0.032, 0.023], 0xe0ce9e, [-0.24, 1.67, 0.235]);
    this.cylinder(model, 0.115, 0.24, skin, [0, 1.99, 0.02]);
    const head = new THREE.Group();
    head.position.set(0, 2.29, 0.025);
    head.name = "head";
    model.add(head);
    this.sphere(head, [0.255, 0.32, 0.245], skin, [0, 0, 0]);
    this.sphere(head, [0.19, 0.14, 0.195], skin, [0, -0.18, 0.035]);
    this.sphere(head, [0.042, 0.065, 0.073], skin, [0, -0.015, 0.246]);
    for (const side of [-1, 1]) {
      this.sphere(head, [0.045, 0.073, 0.05], skin, [side * 0.254, -0.014, 0]);
      this.sphere(head, [0.021, 0.04, 0.015], 0xa4775e, [side * 0.279, -0.016, 0.023]);
      this.sphere(head, [0.06, 0.064, 0.019], skin, [side * 0.105, 0.067, 0.222]);
      this.sphere(head, [0.047, 0.03, 0.024], 0xeee7d8, [side * 0.098, 0.049, 0.234]);
      this.sphere(head, [0.02, 0.024, 0.011], 0x35433e, [side * 0.098, 0.049, 0.255]);
      this.sphere(head, [0.01, 0.015, 0.009], 0x141b19, [side * 0.098, 0.049, 0.264]);
      this.sphere(head, [0.006, 0.007, 0.003], 0xffffff, [side * 0.098 - 0.006, 0.06, 0.272]);
      const brow = this.sphere(head, [0.062, 0.015, 0.016], hair, [side * 0.099, 0.108, 0.23]);
      brow.rotation.z = side * 0.07;
    }
    const smile = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.06, -0.125, 0.221),
      new THREE.Vector3(0, -0.14, 0.237),
      new THREE.Vector3(0.06, -0.125, 0.221),
    ]);
    this.mesh(head, new THREE.TubeGeometry(smile, 12, 0.007, 6, false), 0x8f5949, [0, 0, 0]);
    // Sculpted side parts, swept locks and occasional glasses distinguish each seat.
    this.sphere(head, [0.26, 0.135, 0.24], hair, [0, 0.233, -0.035]);
    this.sphere(head, [0.255, 0.2, 0.16], hair, [0, 0.1, -0.14]);
    for (let i = 0; i < 5; i++) {
      const lock = this.sphere(head, [0.07, 0.065 + (i % 2) * 0.014, 0.15], hair, [
        -0.19 + i * 0.08,
        0.27 - Math.abs(i - 2) * 0.014,
        0.065,
      ]);
      lock.rotation.z = -0.35;
      lock.rotation.y = -0.3;
    }
    if (index % 3 === 0) {
      for (const side of [-1, 1]) {
        const frame = this.mesh(head, new THREE.TorusGeometry(0.066, 0.009, 8, 24), 0xa28d65, [
          side * 0.098,
          0.05,
          0.27,
        ]);
        frame.scale.y = 0.85;
      }
      this.box(head, [0.06, 0.008, 0.01], 0xa28d65, [0, 0.066, 0.28]);
    }
    if (index % 3 === 1) {
      this.sphere(head, [0.19, 0.11, 0.095], hair, [0, -0.195, 0.123]);
      this.sphere(head, [0.065, 0.016, 0.017], hair, [0, -0.086, 0.237]);
    }
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.4, 1.76, 0.1);
      model.add(arm);
      arms.push(arm);
      const sleeve = this.sphere(arm, [0.17, 0.31, 0.17], shirt, [side * 0.4, 1.52, 0.12]);
      sleeve.rotation.x = -0.44;
      this.sphere(arm, [0.15, 0.145, 0.16], shirt, [side * 0.44, 1.31, 0.31]);
      const forearm = this.sphere(arm, [0.115, 0.115, 0.3], shirt, [side * 0.36, 1.4, 0.52]);
      forearm.rotation.y = -side * 0.35;
      this.sphere(arm, [0.112, 0.083, 0.065], 0xe8ddc7, [side * 0.28, 1.43, 0.73]);
      this.sphere(arm, [0.12, 0.07, 0.13], skin, [side * 0.26, 1.45, 0.82]);
      for (let i = 0; i < 3; i++)
        this.sphere(arm, [0.021, 0.035, 0.062], skin, [side * 0.26 + (i - 1) * 0.039, 1.45, 0.905]);
      arm.children.forEach((part) => part.position.sub(arm.position));
    }
    const hand = new THREE.Group();
    hand.name = "hand";
    model.add(hand);
    this.updatePersonHand(hand, this.options.variant === "bunker" ? 0 : person.count);
    const animator = new TableAvatarAnimator(body, head, arms[0], arms[1], hand);
    animator.setEliminated(Boolean(person.eliminated), person.eliminatedAt, true);
    this.avatars.set(person.id, animator);
    const ring = this.ring(group, 0.6, 0.024, 0xe3b868, 0.04);
    ring.name = "turn-marker";
    ring.visible = person.active;
    (ring.material as THREE.MeshStandardMaterial).emissive.set(0x806127);
    const node = document.createElement("div");
    node.className = `table3d-person-label${person.active ? " is-active" : ""}`;
    const name = document.createElement("strong");
    name.textContent = person.name;
    const detail = document.createElement("span");
    detail.textContent = `${person.count} карт · ${person.detail}`;
    node.append(name, detail);
    this.labelHost.append(node);
    this.updatePersonLabel(node, person);
    this.labels.set(person.id, { node, position: group.position.clone().setY(2.87) });
  }

  private updatePersonHand(hand: THREE.Group, count: number) {
    const visibleCount = Math.min(count, 8);
    if (hand.userData.count === visibleCount) return;
    this.disposeGroup(hand);
    hand.userData.count = visibleCount;
    for (let i = 0; i < visibleCount; i++) {
      const card = this.makeCard();
      card.position.set((i - (visibleCount - 1) / 2) * 0.066, 1.67, 0.62);
      card.scale.setScalar(0.39);
      card.rotation.set(-1.1, 0, (i - 2.5) * -0.09);
      hand.add(card);
    }
  }

  private updatePersonLabel(node: HTMLDivElement, person: TablePerson) {
    node.classList.toggle("is-active", person.active);
    node.classList.toggle("is-selected", Boolean(person.selected));
    node.classList.toggle("is-muted", Boolean(person.muted));
    const key = JSON.stringify([person.name, person.count, person.detail, person.traits]);
    if (node.dataset.content === key) return;
    node.dataset.content = key;
    if (!person.traits) {
      node.children[0].textContent = person.name;
      node.children[1].textContent = `${person.count} карт · ${person.detail}`;
      return;
    }
    node.classList.add("table3d-dossier");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "table3d-dossier-content";
    button.setAttribute("aria-label", `Характеристики: ${person.name}`);
    button.onclick = () => this.options.onSelectPerson?.(person.id);
    const name = document.createElement("strong");
    name.textContent = person.name;
    const status = document.createElement("span");
    status.className = "table3d-dossier-status";
    status.textContent = person.detail;
    button.append(name, status);
    const traits = document.createElement("dl");
    person.traits.forEach((trait) => {
      const row = document.createElement("div");
      row.className = "table3d-trait";
      if (trait.kind) row.dataset.attrType = trait.kind;
      const label = document.createElement("dt");
      if (trait.iconPath) {
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("class", "table3d-trait-icon");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("stroke-width", "1.8");
        icon.setAttribute("stroke-linecap", "round");
        icon.setAttribute("stroke-linejoin", "round");
        icon.setAttribute("aria-hidden", "true");
        icon.setAttribute("focusable", "false");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", trait.iconPath);
        icon.append(path);
        label.append(icon);
      }
      label.append(document.createTextNode(trait.label));
      const value = document.createElement("dd");
      value.textContent = trait.value;
      if (trait.detail) value.title = trait.detail;
      row.append(label, value);
      traits.append(row);
    });
    if (!person.traits.length) {
      const empty = document.createElement("span");
      empty.textContent = "Нет открытых карт";
      button.append(empty);
    }
    button.append(traits);
    node.replaceChildren(button);
  }

  focusPerson(id: string) {
    const position = this.seatPositions.get(id);
    if (!position) return;
    this.controls.target.yaw = Math.atan2(-position.x, this.camera.position.z - position.z);
    this.controls.target.pitch = -0.12;
  }

  update(state: RoundTableState) {
    this.labelHost.style.setProperty(
      "--table3d-dossier-width",
      `${Math.max(88, Math.min(174, (174 * 8) / state.people.length))}px`,
    );
    const radius = Math.max(RADIUS, state.people.length * 0.28);
    this.seatRadius = radius + 0.5;
    this.table.scale.set(radius / RADIUS, 1, radius / RADIUS);
    this.camera.position.z = this.seatRadius + 0.85;
    const peopleKey = JSON.stringify([state.people.map((person) => person.id), state.viewerId]);
    if (peopleKey !== this.peopleKey) {
      this.peopleKey = peopleKey;
      this.disposeGroup(this.players);
      this.avatars.clear();
      this.labels.forEach(({ node }) => node.remove());
      this.labels.clear();
      this.seatPositions.clear();
      const viewerIndex = state.people.findIndex((p) => p.id === state.viewerId);
      state.people.forEach((person, index) => {
        const relative =
          viewerIndex < 0
            ? index + 0.5
            : (index - viewerIndex + state.people.length) % state.people.length;
        const angle = (relative / state.people.length) * Math.PI * 2;
        if (person.id === state.viewerId) {
          this.seatPositions.set(person.id, new THREE.Vector3(0, 2, this.seatRadius));
          return;
        }
        this.makePerson(person, index, angle);
      });
      for (const id of this.remoteLooks.keys())
        if (!this.seatPositions.has(id)) this.remoteLooks.delete(id);
    }
    this.players.children.forEach((group) => {
      const person = state.people.find((candidate) => candidate.id === group.userData.seatId);
      if (!person) return;
      group.userData.isBot = person.isBot;
      this.avatars.get(person.id)?.setEliminated(Boolean(person.eliminated), person.eliminatedAt);
      const hand = group.getObjectByName("hand");
      if (hand instanceof THREE.Group)
        this.updatePersonHand(hand, this.options.variant === "bunker" ? 0 : person.count);
      const marker = group.getObjectByName("turn-marker");
      if (marker) marker.visible = person.active && !person.eliminated;
      const label = this.labels.get(person.id)?.node;
      if (label) this.updatePersonLabel(label, person);
    });
    const pileKey = JSON.stringify([state.deckCount, state.discardCount, state.trump]);
    if (pileKey !== this.pileKey) {
      this.pileKey = pileKey;
      this.disposeGroup(this.pile);
      if (state.trump && state.deckCount > 0) {
        const trump = this.makeCard(state.trump.rank, state.trump.suit, state.trump.red);
        trump.position.set(-1.86, TABLE_Y + 0.046, 0.1);
        trump.rotation.y = Math.PI / 2;
        this.pile.add(trump);
      }
      for (let i = 0; i < Math.min(state.deckCount, 12); i++) {
        const card = this.makeCard();
        card.position.set(-2.06, TABLE_Y + 0.06 + i * 0.014, -0.12);
        this.pile.add(card);
      }
      for (let i = 0; i < Math.min(state.discardCount, 7); i++) {
        const card = this.makeCard();
        card.position.set(2.03, TABLE_Y + 0.05 + i * 0.012, -0.1);
        card.rotation.y = i * 0.12;
        this.pile.add(card);
      }
    }
    const activeIds = new Set(state.cards.map((card) => card.id));
    this.cards.forEach((entry, id) => {
      if (activeIds.has(id) || entry.removing) return;
      entry.removing = true;
      entry.target.copy(
        state.takeSeatId
          ? (this.seatPositions.get(state.takeSeatId) ?? new THREE.Vector3(2, TABLE_Y, 0))
          : new THREE.Vector3(2, TABLE_Y + 0.1, 0),
      );
    });
    state.cards.forEach((card) => {
      let entry = this.cards.get(card.id);
      if (!entry) {
        const mesh = this.makeCard(card.rank, card.suit, card.red, card.color);
        mesh.position.copy(this.seatPositions.get(card.sourceId) ?? new THREE.Vector3(0, 2, 3.4));
        entry = { mesh, target: new THREE.Vector3(), removing: false };
        this.cards.set(card.id, entry);
        this.scene.add(mesh);
      }
      entry.removing = false;
      entry.target.set(card.x, TABLE_Y + (card.covered ? 0.066 : 0.046), card.z);
      entry.mesh.rotation.y = card.covered ? -0.17 : 0.05;
      entry.mesh.userData.cardId = card.selectable ? card.id : null;
      const face = entry.mesh.material[2] as THREE.MeshStandardMaterial;
      face.emissive.set(card.focused ? 0xc08a24 : card.selectable ? 0x55451c : 0x000000);
      face.emissiveIntensity = card.focused ? 0.48 : card.selectable ? 0.24 : 0;
      if (this.reducedMotion.matches) entry.mesh.position.copy(entry.target);
    });
  }

  receiveLook(event: AvatarLookEvent) {
    if (!this.seatPositions.has(event.seatId)) return;
    this.remoteLooks.set(event.seatId, {
      yaw: event.yaw,
      pitch: event.pitch,
      receivedAt: performance.now(),
    });
  }

  receiveReaction(event: RoomReactionEvent) {
    if (this.seenReactions.has(event.eventId)) return;
    this.seenReactions.add(event.eventId);
    if (this.seenReactions.size > 64)
      this.seenReactions.delete(this.seenReactions.values().next().value!);
    this.avatars.get(event.senderSeatId)?.react(event.reactionId, performance.now());
  }

  releaseCursor() {
    this.controls.setCursor(true);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.releaseCursor();
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.fov = width < 600 ? 67 : 60;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private frame(time: number) {
    if (this.disposed || document.hidden) {
      this.lastTime = time;
      return;
    }
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    const smoothing = this.reducedMotion.matches ? 1 : 1 - Math.exp(-14 * dt);
    this.yaw += (this.controls.target.yaw - this.yaw) * smoothing;
    this.pitch += (this.controls.target.pitch - this.pitch) * smoothing;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.cards.forEach((entry, id) => {
      entry.mesh.position.lerp(
        entry.target,
        this.reducedMotion.matches ? 1 : 1 - Math.exp(-7 * dt),
      );
      if (entry.removing && entry.mesh.position.distanceTo(entry.target) < 0.025) {
        this.scene.remove(entry.mesh);
        this.disposeObject(entry.mesh);
        this.cards.delete(id);
      }
    });
    const lookChanged =
      Math.abs(this.yaw - this.lastSentLook.yaw) > 0.005 ||
      Math.abs(this.pitch - this.lastSentLook.pitch) > 0.005;
    if (time - this.lastLookSentAt >= (lookChanged ? AVATAR_LOOK_INTERVAL_MS : 1000)) {
      this.lastLookSentAt = time;
      this.lastSentLook = { yaw: this.yaw, pitch: this.pitch };
      this.onLook(this.lastSentLook);
    }
    this.players.children.forEach((group, index) => {
      const avatar = this.avatars.get(group.userData.seatId);
      if (!avatar) return;
      const look = this.remoteLooks.get(group.userData.seatId);
      const fresh = look && performance.now() - look.receivedAt < AVATAR_LOOK_EXPIRY_MS;
      const targetYaw = fresh
        ? look.yaw
        : group.userData.isBot && !this.reducedMotion.matches
          ? Math.sin(time * 0.00025 + index * 2) * 0.2
          : 0;
      const targetPitch = fresh ? -look.pitch : 0.18;
      avatar.frame(
        time,
        smoothing,
        targetYaw,
        targetPitch,
        this.reducedMotion.matches,
        this.paused,
      );
    });
    const projected = new THREE.Vector3();
    this.labels.forEach(({ node, position }) => {
      projected.copy(position).project(this.camera);
      const visible =
        projected.z > -1 &&
        projected.z < 1 &&
        Math.abs(projected.x) < 1.08 &&
        Math.abs(projected.y) < 1.1;
      node.hidden = !visible;
      if (visible)
        node.style.transform = `translate(-50%, -100%) translate(${THREE.MathUtils.clamp((projected.x * 0.5 + 0.5) * this.host.clientWidth, node.offsetWidth / 2 + 6, this.host.clientWidth - node.offsetWidth / 2 - 6)}px, ${THREE.MathUtils.clamp((-projected.y * 0.5 + 0.5) * this.host.clientHeight, node.offsetHeight + 8, this.host.clientHeight - 8)}px)`;
    });
    this.renderer.render(this.scene, this.camera);
  }

  private disposeObject(object: THREE.Object3D) {
    const materials = new Set<THREE.Material>();
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(
        (material: THREE.Material) => materials.add(material),
      );
    });
    materials.forEach((material) => material.dispose());
  }

  private disposeGroup(group: THREE.Group) {
    this.disposeObject(group);
    group.clear();
  }

  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.controls.dispose();
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.disposeObject(this.scene);
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
    this.avatars.clear();
    this.seenReactions.clear();
    this.labels.forEach(({ node }) => node.remove());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
