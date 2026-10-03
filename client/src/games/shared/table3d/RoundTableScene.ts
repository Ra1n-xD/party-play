import { getCardSkin, type CardSkinId } from "../../../../../shared/platform/cosmetics";
import { drawCardBack, drawCardFace } from "../../../platform/cardFaceArtwork";
import * as THREE from "three";
import { makeRoomEnvironment } from "./RoomEnvironment";
import { CARD_HEIGHT, makeCardGeometry, type CardMesh } from "./CardGeometry";
import { HAND_CARD_EDGE_Y, makeSeatedArm, roundedPart } from "./AvatarParts";
import { getAvatar, type AvatarId } from "../../../../../shared/platform/avatars";
import { makeSeatedAvatar } from "./AvatarModel";
import {
  AVATAR_LOOK_INTERVAL_MS,
  AVATAR_LOOK_EXPIRY_MS,
  type AvatarLook,
  type AvatarLookEvent,
} from "../../../../../shared/platform/avatarLook";
import { TableLookControls, TABLE_DEFAULT_PITCH, isTableInputBlocked } from "./TableLookControls";
import { TableAvatarAnimator } from "./TableAvatarAnimator";
import type { RoomReactionEvent } from "../../../../../shared/platform/reactions";
import { FirstPersonHand, type CardFace, type TableHandCard } from "./FirstPersonHand";
import { mergeRigidParts } from "./mergeRigidParts";

export interface TablePerformance {
  fps: number;
  fpsLimit: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  resolution: string;
  renderer: string;
}

export interface TablePerson {
  id: string;
  avatarId: AvatarId;
  cardSkinId?: CardSkinId;
  name: string;
  count: number;
  active: boolean;
  detail: string;
  role?: string;
  isBot: boolean;
  traits?: { label: string; value: string; detail?: string; kind?: string; iconPath?: string }[];
  selected?: boolean;
  muted?: boolean;
  eliminated?: boolean;
  eliminatedAt?: number;
}

export interface TableCard extends CardFace {
  id: string;
  x: number;
  z: number;
  covered: boolean;
  sourceId: string;
  selectable: boolean;
  focused: boolean;
}

export interface RoundTableState {
  people: TablePerson[];
  viewerId: string | null;
  cards: TableCard[];
  deckCount: number;
  discardCount: number;
  trump: { rank: string; suit: string; red: boolean } | null;
  takeSeatId: string | null;
  ownHand?: TableHandCard[];
  cardSkinId?: CardSkinId;
}

interface MovingCard {
  mesh: CardMesh;
  target: THREE.Vector3;
  removing: boolean;
}

interface PersonLabel {
  node: HTMLDivElement;
  position: THREE.Vector3;
  width: number;
  height: number;
  transform: string;
}

export interface TableSceneOptions {
  variant?: "durak" | "uno" | "bunker";
  onSelectPerson?: (id: string) => void;
  onFocusHandCard?: (id: string) => void;
  onSelectHandCard?: (id: string) => void;
  onMenuRequest: (error?: string, nativeEscape?: boolean) => void;
  onOverviewChange: (overview: boolean) => void;
}

const TABLE_Y = 1.44;
const RADIUS = 3.05;
const TABLE_CARD_SCALE = 0.82;
const FPS_LIMIT = 120;
const FRAME_INTERVAL_MS = 1000 / FPS_LIMIT;
const MAX_RENDER_PIXELS = 2560 * 1440;

/** Public table plus the viewer's own cards. Opponents' hands are represented by counts only. */
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
  private readonly cardArms = new Map<string, ReturnType<typeof makeSeatedArm>>();
  private readonly seenReactions = new Set<string>();
  private readonly labels = new Map<string, PersonLabel>();
  private readonly labelSizes = new WeakMap<Element, PersonLabel>();
  private readonly controls: TableLookControls;
  private readonly ownHand: FirstPersonHand;
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
  private nextFrameAt = 0;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private disposed = false;
  private paused = false;
  private seatRadius = 3.55;
  private readonly seatedPosition = new THREE.Vector3(0, 2.85, 3.65);
  private readonly viewPosition = new THREE.Vector3();
  private readonly viewRotation = new THREE.Quaternion();
  private readonly viewEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly projectedLabel = new THREE.Vector3();
  private readonly performanceLabel = document.createElement("div");
  private performanceVisible = false;
  private sampleStartedAt = 0;
  private sampleFrames = 0;
  private sampleWorkMs = 0;
  private graphicsRenderer: string | null = null;
  private performance: Omit<TablePerformance, "renderer" | "fpsLimit"> = {
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    resolution: "",
  };
  private overview = false;

  constructor(
    private readonly host: HTMLDivElement,
    private readonly labelHost: HTMLDivElement,
    private readonly onLook: (look: AvatarLook) => void,
    onCursor: (visible: boolean) => void,
    private readonly onFailure: () => void,
    private readonly options: TableSceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Keep world, shadow and first-person hand counters in the same frame sample.
    this.renderer.info.autoReset = false;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Круглый 3D-стол. R — вид сверху, Esc — меню.",
    );
    this.host.append(this.renderer.domElement);
    this.performanceLabel.className = "table3d-performance";
    this.performanceLabel.hidden = true;
    this.host.append(this.performanceLabel);
    this.scene.background = new THREE.Color(0x172521);
    this.scene.fog = new THREE.Fog(0x172521, 12, 28);
    this.scene.add(this.room, this.players, this.pile, this.table);
    this.makeRoom();
    if (options.variant === "bunker") this.seatedPosition.set(0, 3.12, 4.4);
    this.camera.position.copy(this.seatedPosition);
    this.pitch = options.variant === "bunker" ? -0.16 : TABLE_DEFAULT_PITCH;
    this.controls = new TableLookControls(
      this.renderer.domElement,
      onCursor,
      options.onMenuRequest,
      () => this.toggleOverview(),
      this.pitch,
    );
    this.ownHand = new FirstPersonHand(
      host,
      (face) => this.makeCard(face.rank, face.suit, face.red, face.color, face.skinId),
      (object) => this.disposeObject(object),
      (id) => this.options.onFocusHandCard?.(id),
      (id) => this.options.onSelectHandCard?.(id),
    );
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === host) {
          this.resize();
          continue;
        }
        const label = this.labelSizes.get(entry.target);
        if (!label) continue;
        const box = entry.borderBoxSize[0];
        const width = box?.inlineSize ?? label.node.offsetWidth;
        const height = box?.blockSize ?? label.node.offsetHeight;
        // Hidden labels report zero size; keep their last visible dimensions.
        if (width > 0) label.width = width;
        if (height > 0) label.height = height;
      }
    });
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
    this.room.add(
      makeRoomEnvironment(
        this.options.variant ?? "durak",
        this.textures,
        Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8),
      ),
    );
    this.scene.add(new THREE.HemisphereLight(0xe5e7e4, 0x6c4e3d, 1.85));
    const key = new THREE.DirectionalLight(0xffe3b9, 1.65);
    key.position.set(-3, 6, 4);
    this.scene.add(key);
    const tableLight = new THREE.SpotLight(0xffe5bd, 65, 16, Math.PI / 3, 0.65, 2);
    tableLight.position.set(-1.2, 6.05, 1.6);
    tableLight.target.position.set(0, TABLE_Y, 0);
    tableLight.castShadow = true;
    tableLight.shadow.mapSize.set(2048, 2048);
    tableLight.shadow.camera.near = 0.5;
    tableLight.shadow.camera.far = 16;
    tableLight.shadow.normalBias = 0.025;
    tableLight.shadow.bias = -0.0002;
    this.scene.add(tableLight, tableLight.target);
    const moonlight = new THREE.PointLight(0xa1c6e2, 22, 17, 2);
    moonlight.position.set(4.7, 4.2, -5.9);
    this.scene.add(moonlight);

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
    mergeRigidParts(this.table);
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

  private cardTexture(
    rank: string,
    suit: string,
    red: boolean,
    color?: TableCard["color"],
    skinId?: CardSkinId,
  ) {
    const skin = getCardSkin(skinId);
    const key = `${this.options.variant}:${rank}:${suit}:${red}:${color ?? ""}:${skin.id}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    const game = this.options.variant === "uno" ? "uno" : "durak";
    if (rank) drawCardFace(ctx, { game, rank, suit, red, color }, skin.id);
    else drawCardBack(ctx, game, skin.id);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    this.textures.set(key, texture);
    return texture;
  }

  private makeCard(
    rank = "",
    suit = "",
    red = false,
    color?: TableCard["color"],
    skinId?: CardSkinId,
  ) {
    const edge = this.material(0xe4dac4);
    const face = new THREE.MeshStandardMaterial({
      map: this.cardTexture(rank, suit, red, color, skinId),
      roughness: 0.85,
    });
    const back = new THREE.MeshStandardMaterial({
      map: this.cardTexture("", "", false, undefined, skinId),
      roughness: 0.85,
    });
    const mesh = new THREE.Mesh(makeCardGeometry(), [edge, edge, face, back]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private makeTableCard(
    rank = "",
    suit = "",
    red = false,
    color?: TableCard["color"],
    skinId?: CardSkinId,
  ) {
    const mesh = this.makeCard(rank, suit, red, color, skinId);
    mesh.scale.setScalar(TABLE_CARD_SCALE);
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
    // Rounded, tufted leather chair with brass feet.
    this.sphere(group, [0.52, 0.16, 0.47], 0x47372f, [0, 0.76, -0.02]);
    this.sphere(group, [0.52, 0.7, 0.14], 0x493830, [0, 1.3, -0.4]);
    for (const x of [-0.24, 0, 0.24])
      for (const y of [1.1, 1.45])
        this.sphere(group, [0.025, 0.025, 0.016], 0x2c211b, [x, y, -0.254]);
    for (const side of [-1, 1])
      for (const z of [-0.28, 0.27])
        this.box(group, [0.055, 0.72, 0.055], 0x997847, [side * 0.35, 0.36, z]);
    const holdsCards = this.options.variant !== "bunker" && person.count > 0;
    const { body, head, leftArm, rightArm, hand, face, legs } = makeSeatedAvatar(
      person.avatarId,
      holdsCards,
    );
    group.add(body);
    this.cardArms.set(person.id, leftArm);
    this.updatePersonHand(
      hand,
      this.options.variant === "bunker" ? 0 : person.count,
      person.cardSkinId,
    );
    mergeRigidParts(group);
    const animator = new TableAvatarAnimator(
      body,
      head,
      leftArm,
      rightArm,
      hand,
      index * 1.7,
      face,
      legs,
    );
    animator.setEliminated(Boolean(person.eliminated), person.eliminatedAt, true);
    this.avatars.set(person.id, animator);
    const ring = this.ring(group, 0.6, 0.024, 0x68ed9e, 0.04);
    ring.name = "turn-marker";
    ring.visible = person.active;
    (ring.material as THREE.MeshStandardMaterial).emissive.set(0x226a40);
    const node = document.createElement("div");
    node.className = `table3d-person-label${person.active ? " is-active" : ""}`;
    this.labelHost.append(node);
    this.updatePersonLabel(node, person);
    const label: PersonLabel = {
      node,
      position: group.position.clone().setY(2.87),
      width: 0,
      height: 0,
      transform: "",
    };
    this.labels.set(person.id, label);
    this.labelSizes.set(node, label);
    this.resizeObserver.observe(node, { box: "border-box" });
  }

  private updatePersonHand(hand: THREE.Group, count: number, skinId?: CardSkinId) {
    const visibleCount = Math.min(count, 8);
    if (hand.userData.count === visibleCount && hand.userData.skinId === skinId) return;
    this.disposeGroup(hand);
    hand.userData.count = visibleCount;
    hand.userData.skinId = skinId;
    for (let i = 0; i < visibleCount; i++) {
      const card = this.makeCard("", "", false, undefined, skinId);
      const offset = i - (visibleCount - 1) / 2;
      const pivot = new THREE.Group();
      // All lower card edges meet at the pinch, instead of spreading beyond the fingers.
      pivot.position.z = -i * 0.0009;
      pivot.rotation.z = -offset * 0.14;
      card.position.y = HAND_CARD_EDGE_Y + (CARD_HEIGHT * 0.32) / 2;
      card.scale.setScalar(0.32);
      card.rotation.x = Math.PI / 2;
      pivot.add(card);
      hand.add(pivot);
    }
  }

  private updatePersonLabel(node: HTMLDivElement, person: TablePerson) {
    const active = person.active && !person.eliminated;
    node.classList.toggle("is-active", active);
    node.classList.toggle("is-selected", Boolean(person.selected));
    node.classList.toggle("is-muted", Boolean(person.muted));
    const key = JSON.stringify([
      person.name,
      person.count,
      person.detail,
      person.role,
      person.traits,
      active,
    ]);
    if (node.dataset.content === key) return;
    node.dataset.content = key;
    const turn = document.createElement("span");
    turn.className = "table3d-person-turn";
    turn.textContent = person.role ?? "Ходит";
    turn.hidden = !active && !person.role;
    const name = document.createElement("strong");
    name.textContent = person.name;
    if (!person.traits) {
      const detail = document.createElement("span");
      detail.textContent = `${person.count} карт · ${person.detail}`;
      node.replaceChildren(turn, name, detail);
      return;
    }
    node.classList.add("table3d-dossier");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "table3d-dossier-content";
    button.setAttribute("aria-label", `Характеристики: ${person.name}`);
    button.onclick = () => this.options.onSelectPerson?.(person.id);
    const status = document.createElement("span");
    status.className = "table3d-dossier-status";
    status.textContent = person.detail;
    button.append(turn, name, status);
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
    if (this.overview) this.toggleOverview();
    this.controls.target.yaw = Math.atan2(-position.x, this.seatedPosition.z - position.z);
    this.controls.target.pitch = -0.12;
  }

  update(state: RoundTableState) {
    const ownIndex = state.people.findIndex((person) => person.id === state.viewerId);
    const ownAvatar = getAvatar(state.people[ownIndex]?.avatarId);
    this.ownHand.update(
      ownIndex >= 0
        ? (state.ownHand ?? []).map((card) => ({ ...card, skinId: state.cardSkinId }))
        : [],
      ownAvatar.skin,
      ownAvatar.outfit,
    );
    this.labelHost.style.setProperty(
      "--table3d-dossier-width",
      `${Math.max(88, Math.min(174, (174 * 8) / state.people.length))}px`,
    );
    const radius = Math.max(RADIUS, state.people.length * 0.28);
    this.seatRadius = radius + 0.5;
    this.table.scale.set(radius / RADIUS, 1, radius / RADIUS);
    this.seatedPosition.z = this.seatRadius + (this.options.variant === "bunker" ? 0.85 : 0.1);
    const peopleKey = JSON.stringify([
      state.people.map((person) => [person.id, person.avatarId, person.cardSkinId]),
      state.viewerId,
    ]);
    if (peopleKey !== this.peopleKey) {
      this.peopleKey = peopleKey;
      this.disposeGroup(this.players);
      this.avatars.clear();
      this.cardArms.clear();
      this.labels.forEach(({ node }) => {
        this.resizeObserver.unobserve(node);
        node.remove();
      });
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
      this.cardArms
        .get(person.id)
        ?.setHolding(this.options.variant !== "bunker" && person.count > 0);
      const hand = group.getObjectByName("hand");
      if (hand instanceof THREE.Group)
        this.updatePersonHand(
          hand,
          this.options.variant === "bunker" ? 0 : person.count,
          person.cardSkinId,
        );
      const marker = group.getObjectByName("turn-marker");
      if (marker) marker.visible = person.active && !person.eliminated;
      const label = this.labels.get(person.id)?.node;
      if (label) this.updatePersonLabel(label, person);
    });
    const pileKey = JSON.stringify([
      state.deckCount,
      state.discardCount,
      state.trump,
      state.cardSkinId,
    ]);
    if (pileKey !== this.pileKey) {
      this.pileKey = pileKey;
      this.disposeGroup(this.pile);
      if (state.trump && state.deckCount > 0) {
        const trump = this.makeTableCard(
          state.trump.rank,
          state.trump.suit,
          state.trump.red,
          undefined,
          state.cardSkinId,
        );
        trump.position.set(-1.86, TABLE_Y + 0.046, 0.1);
        trump.rotation.y = Math.PI / 2;
        trump.name = "stock-trump";
        this.pile.add(trump);
      }
      const coveredCount = Math.max(0, state.deckCount - (state.trump ? 1 : 0));
      for (let i = 0; i < Math.min(coveredCount, 12); i++) {
        const card = this.makeTableCard("", "", false, undefined, state.cardSkinId);
        card.name = "stock-card";
        card.position.set(-2.06, TABLE_Y + 0.06 + i * 0.006, -0.12);
        this.pile.add(card);
      }
      for (let i = 0; i < Math.min(state.discardCount, 7); i++) {
        const card = this.makeTableCard("", "", false, undefined, state.cardSkinId);
        card.name = "discard-card";
        card.userData.layer = i;
        card.position.set(2.03, TABLE_Y + 0.05 + i * 0.006, -0.1);
        card.rotation.y = i * 0.12;
        this.pile.add(card);
      }
      this.layoutPiles();
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
        const mesh = this.makeTableCard(
          card.rank,
          card.suit,
          card.red,
          card.color,
          card.skinId ?? state.cardSkinId,
        );
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

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  getPerformance(): TablePerformance {
    if (this.graphicsRenderer === null) {
      const gl = this.renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      this.graphicsRenderer = String(
        gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      );
    }
    return { ...this.performance, fpsLimit: FPS_LIMIT, renderer: this.graphicsRenderer };
  }

  get isPerformanceVisible() {
    return this.performanceVisible;
  }

  setPerformanceVisible(visible: boolean) {
    this.performanceVisible = visible;
    this.performanceLabel.hidden = !visible;
    if (visible) this.updatePerformanceLabel();
  }

  private updatePerformanceLabel() {
    const { fps, frameMs, drawCalls } = this.performance;
    this.performanceLabel.textContent = `${fps} FPS · кадр ${frameMs.toFixed(1)} мс · ${drawCalls} команд`;
  }

  resumeLook(capture = true) {
    this.controls.resume(capture);
  }

  releaseLook() {
    this.controls.release();
  }

  toggleOverview() {
    this.overview = !this.overview;
    this.ownHand.setOverview(this.overview);
    this.options.onOverviewChange(this.overview);
  }

  private layoutPiles() {
    const compact =
      this.viewportWidth <= 600 &&
      this.options.variant !== "uno" &&
      this.options.variant !== "bunker";
    for (const card of this.pile.children) {
      card.scale.setScalar(TABLE_CARD_SCALE * (compact ? 0.9 : 1));
      if (card.name === "stock-trump") {
        card.position.x = compact ? -0.12 : -1.86;
        card.position.z = compact ? -1.43 : 0.1;
      } else if (card.name === "stock-card") {
        card.position.x = compact ? -0.61 : -2.06;
        card.position.z = compact ? -1.64 : -0.12;
      } else if (card.name === "discard-card") {
        card.position.x = compact ? 0.93 : 2.03;
        card.position.z = compact ? -1.68 : -0.1;
        card.rotation.y = card.userData.layer * (compact ? 0.035 : 0.12);
      }
    }
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera.aspect = width / height;
    this.camera.fov =
      this.options.variant === "bunker" ? (width < 600 ? 67 : 60) : width < 600 ? 58 : 48;
    this.camera.updateProjectionMatrix();
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      1.75,
      Math.sqrt(MAX_RENDER_PIXELS / (width * height)),
    );
    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.ownHand.resize(width, height);
    this.layoutPiles();
  }

  private frame(time: number) {
    if (this.disposed || document.hidden) {
      this.lastTime = time;
      this.nextFrameAt = 0;
      this.sampleStartedAt = 0;
      this.sampleFrames = 0;
      this.sampleWorkMs = 0;
      return;
    }
    if (time + 0.25 < this.nextFrameAt) return;
    const frameStartedAt = performance.now();
    this.renderer.info.reset();
    if (!this.sampleStartedAt) this.sampleStartedAt = time - FRAME_INTERVAL_MS;
    // Keep the render limit on 240/500 Hz displays, without catching up after a stall.
    const scheduledAt = this.nextFrameAt || time;
    this.nextFrameAt =
      scheduledAt +
      (Math.floor(Math.max(0, time - scheduledAt) / FRAME_INTERVAL_MS) + 1) * FRAME_INTERVAL_MS;
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    const smoothing = this.reducedMotion.matches ? 1 : 1 - Math.exp(-14 * dt);
    // Overhead inspection is local; keep the seated head pose for other players.
    if (!this.overview) {
      this.yaw += (this.controls.target.yaw - this.yaw) * smoothing;
      this.pitch += (this.controls.target.pitch - this.pitch) * smoothing;
    } else {
      this.controls.target.yaw = this.yaw;
      this.controls.target.pitch = this.pitch;
    }
    if (this.overview) {
      const halfWidth = this.options.variant === "bunker" ? this.seatRadius : 2.8;
      const halfDepth = this.options.variant === "bunker" ? this.seatRadius : 2.55;
      const height =
        Math.max(halfDepth, halfWidth / this.camera.aspect) /
        Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      this.viewPosition.set(0, TABLE_Y + height, this.options.variant === "bunker" ? 0 : 0.6);
      this.viewRotation.setFromEuler(this.viewEuler.set(-Math.PI / 2, 0, 0, "YXZ"));
    } else {
      this.viewPosition.copy(this.seatedPosition);
      this.viewRotation.setFromEuler(this.viewEuler.set(this.pitch, this.yaw, 0, "YXZ"));
    }
    this.camera.position.lerp(this.viewPosition, smoothing);
    this.camera.quaternion.slerp(this.viewRotation, smoothing);
    // Slice away the ceiling and pendant lamps when inspecting the table from above.
    const near = Math.max(0.08, this.camera.position.y - 3.65);
    if (Math.abs(this.camera.near - near) > 0.001) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = this.overview ? 50 : 12;
      this.scene.fog.far = this.overview ? 60 : 28;
    }
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
      const fresh = look && time - look.receivedAt < AVATAR_LOOK_EXPIRY_MS;
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
    const projected = this.projectedLabel;
    this.labels.forEach((label, id) => {
      const { node, position, width, height } = label;
      const rise = Math.max(0, this.avatars.get(id)?.heightOffset ?? 0);
      position.y = 2.87 + rise;
      projected.copy(position).project(this.camera);
      const visible =
        !this.overview &&
        projected.z > -1 &&
        projected.z < 1 &&
        Math.abs(projected.x) < 1.08 &&
        Math.abs(projected.y) < 1.1;
      if (node.hidden === visible) node.hidden = !visible;
      if (!visible) return;
      // A standing head can reach the top edge. Move its label beside the face,
      // instead of clamping the label down over the laughing expression.
      const side = projected.x > 0.35 ? -1 : 1;
      const standingOffset = THREE.MathUtils.smoothstep(rise, 0.02, 0.3) * (width / 2 + 48) * side;
      const x = THREE.MathUtils.clamp(
        (projected.x * 0.5 + 0.5) * this.viewportWidth + standingOffset,
        width / 2 + 6,
        this.viewportWidth - width / 2 - 6,
      );
      const y = THREE.MathUtils.clamp(
        (-projected.y * 0.5 + 0.5) * this.viewportHeight,
        height + (this.viewportWidth <= 680 ? 86 : 8),
        this.viewportHeight - 8,
      );
      const transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (label.transform !== transform) {
        node.style.transform = transform;
        label.transform = transform;
      }
    });
    this.renderer.render(this.scene, this.camera);
    this.ownHand.setInteractive(
      this.controls.isCursorVisible && !this.paused && !isTableInputBlocked(null),
    );
    this.ownHand.render(this.renderer, smoothing);
    this.sampleFrames++;
    this.sampleWorkMs += performance.now() - frameStartedAt;
    const sampleDuration = time - this.sampleStartedAt;
    if (sampleDuration >= 1000) {
      this.performance = {
        fps: Math.round((this.sampleFrames * 1000) / sampleDuration),
        frameMs: this.sampleWorkMs / this.sampleFrames,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        resolution: `${this.renderer.domElement.width} × ${this.renderer.domElement.height}`,
      };
      this.sampleStartedAt = time;
      this.sampleFrames = 0;
      this.sampleWorkMs = 0;
      if (this.performanceVisible) this.updatePerformanceLabel();
    }
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
    this.ownHand.dispose();
    this.disposeObject(this.scene);
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
    this.avatars.clear();
    this.seenReactions.clear();
    this.labels.forEach(({ node }) => node.remove());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.performanceLabel.remove();
  }
}
