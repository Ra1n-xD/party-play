import * as THREE from "three";
import { getAvatar } from "../../../../../shared/platform/avatars";
import { memorySymbols } from "../../memory/presentation";
import { makeSeatedAvatar, type AvatarLegendaryEffectsRig } from "../table3d/AvatarModel";
import { roundedPart } from "../table3d/AvatarParts";
import { PetModel } from "../table3d/PetModel";
import { PET_SPECIES_INFO, PET_STAGES } from "../../../../../shared/platform/pet";
import { makeDuelShip, type DuelShipRig } from "./ShipModel";
import type { DuelTableModel } from "./duelTableModel";

type Triple = [number, number, number];
interface Target {
  object: THREE.Object3D;
  button: HTMLButtonElement;
  width: number;
  depth: number;
  y: number;
}
interface Card {
  group: THREE.Group;
  front: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  angle: number;
  value: number | null;
}

function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      geometries.add(child.geometry);
      for (const m of Array.isArray(child.material) ? child.material : [child.material])
        materials.add(m);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  root.clear();
}

/** A local view of the authoritative duel projection, with no game timers or hidden state. */
export class DuelTableScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
  private readonly room = new THREE.Group();
  private readonly table = new THREE.Group();
  private readonly people = new THREE.Group();
  private readonly companions = new THREE.Group();
  private readonly petLabels = document.createElement("div");
  private readonly petSpeech = document.createElement("span");
  private pets: { actor: PetModel; label: HTMLElement }[] = [];
  private petKey = "";
  private petSpeechUntil = 0;
  private avatarEffects?: AvatarLegendaryEffectsRig;
  private animationTime = 0;
  private readonly labels = document.createElement("div");
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private readonly observer: ResizeObserver;
  private readonly reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private model: DuelTableModel | null = null;
  private targets: Target[] = [];
  private cards: Card[] = [];
  private ships: DuelShipRig[] = [];
  private frame = 0;
  private lastFrame = 0;
  private disposed = false;
  private overview = false;
  private boardKey = "";
  private fleetKey = "";
  private avatarKey = "";
  private drag: { x: number; y: number; angle: number; moved: boolean } | null = null;
  private suppressClick = false;
  private angle = 0;
  private width = 1;
  private height = 1;
  private effects: { group: THREE.Group; start: number }[] = [];

  constructor(
    private host: HTMLDivElement,
    private onCell: (cell: number) => void,
    private onFail: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    try {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.domElement.setAttribute("aria-hidden", "true");
      this.labels.className = "duel-table3d-targets";
      this.petLabels.className = "duel-table3d-targets";
      this.petSpeech.className = "duel-table3d-pet-speech";
      this.petSpeech.setAttribute("role", "status");
      this.petSpeech.hidden = true;
      host.append(this.renderer.domElement, this.labels, this.petLabels, this.petSpeech);
      this.scene.background = new THREE.Color("#332938");
      this.scene.fog = new THREE.Fog("#332938", 35, 65);
      this.scene.add(
        this.room,
        this.table,
        this.people,
        this.companions,
        new THREE.HemisphereLight("#e4edff", "#696174", 1.9),
      );
      const light = new THREE.DirectionalLight("#ffe7ce", 2.6);
      light.position.set(-6, 14, 9);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      Object.assign(light.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
      light.shadow.normalBias = 0.03;
      this.scene.add(light);
      const rim = new THREE.DirectionalLight("#b8bbff", 1.1);
      rim.position.set(10, 7, -8);
      this.scene.add(rim);
      this.makeRoom();
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(host);
      host.addEventListener("pointerdown", this.pointerDown);
      host.addEventListener("pointermove", this.pointerMove);
      host.addEventListener("pointerup", this.pointerUp);
      host.addEventListener("pointercancel", this.pointerCancel);
      host.addEventListener("pointerleave", this.pointerCancel);
      this.renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
      document.addEventListener("visibilitychange", this.visibility);
      this.resize();
    } catch (error) {
      this.renderer.dispose();
      host.replaceChildren();
      disposeObjects(this.scene);
      this.textures.forEach((t) => t.dispose());
      throw error;
    }
  }
  private block(parent: THREE.Object3D, size: Triple, color: string, at: Triple, radius = 0.08) {
    const part = roundedPart(
      size,
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
      Math.min(radius, Math.min(...size) * 0.35),
    );
    part.position.set(...at);
    part.castShadow = part.receiveShadow = true;
    parent.add(part);
    return part;
  }
  private cylinder(
    parent: THREE.Object3D,
    top: number,
    bottom: number,
    height: number,
    color: string,
    at: Triple,
  ) {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(top, bottom, height, 24),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    p.position.set(...at);
    p.castShadow = p.receiveShadow = true;
    parent.add(p);
    return p;
  }
  private makeRoom() {
    const g = this.room;
    this.block(g, [40, 0.2, 38], "#493649", [0, -3.4, 0]);
    this.block(g, [14, 0.5, 15], "#51334c", [0, -0.42, -1], 0.2);
    this.block(g, [14.2, 0.16, 15.2], "#a17455", [0, -0.75, -1], 0.06);
    for (const x of [-5, 5])
      for (const z of [-6, 4]) this.block(g, [0.5, 3, 0.5], "#362b32", [x, -2.2, z]);
    this.block(g, [32, 14, 0.3], "#3c3047", [0, 3, -13]);
    this.block(g, [0.3, 14, 30], "#44364a", [-15, 3, 0]);
    this.block(g, [7, 6, 0.16], "#b99880", [7, 4, -12.76]);
    this.block(g, [6.7, 5.7, 0.13], "#668087", [7, 4, -12.62]);
    this.block(g, [0.12, 5.8, 0.1], "#b99880", [7, 4, -12.52]);
    this.block(g, [6.8, 0.12, 0.1], "#b99880", [7, 4, -12.5]);
    for (let row = 0; row < 3; row++) {
      this.block(g, [6, 0.15, 1.3], "#9b7c63", [-7.3, 1.8 + row * 2, -12]);
      for (let j = 0; j < 7; j++)
        this.block(
          g,
          [0.4, 0.9 + (j % 3) * 0.2, 0.7],
          ["#bb8678", "#698d81", "#bbab80", "#8877a9"][j % 4],
          [-9.2 + j * 0.62, 2.4 + row * 2, -12],
        );
    }
    this.cylinder(g, 0.5, 0.55, 0.12, "#b6975b", [-5.6, 0.03, -4.4]);
    this.cylinder(g, 0.04, 0.04, 3.6, "#b6975b", [-5.6, 1.8, -4.4]);
    this.cylinder(g, 0.35, 0.9, 0.65, "#d3bc86", [-5.6, 3.6, -4.4]);
    const lamp = new THREE.PointLight("#ffe0a9", 14, 13, 2);
    lamp.position.set(-5.6, 3, -4.4);
    g.add(lamp);
    this.cylinder(g, 0.5, 0.35, 0.8, "#c9aa8d", [5.7, 0.3, -5.8]);
    for (let j = 0; j < 7; j++) {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 8),
        new THREE.MeshStandardMaterial({ color: "#618c77" }),
      );
      leaf.position.set(
        5.7 + Math.cos(j * 2.4) * 0.35,
        1 + j * 0.15,
        -5.8 + Math.sin(j * 2.4) * 0.35,
      );
      leaf.scale.set(0.5, 1.8, 0.8);
      leaf.rotation.z = Math.cos(j * 2.4) * 0.6;
      g.add(leaf);
    }
    this.block(g, [3.1, 3.3, 0.45], "#372a43", [0, 0.3, -9.1], 0.15);
  }
  private texture(
    key: string,
    draw: (ctx: CanvasRenderingContext2D) => void,
    width = 256,
    height = 320,
  ) {
    const cached = this.textures.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    draw(ctx);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.set(key, t);
    return t;
  }
  private cardTexture(value: number | null, back = false) {
    return this.texture(`card:${back ? "back" : value}`, (ctx) => {
      ctx.fillStyle = back ? "#9f72c0" : "#fff0d8";
      ctx.fillRect(0, 0, 256, 320);
      ctx.strokeStyle = back ? "#f0e1c480" : "#d3bda3";
      ctx.lineWidth = 5;
      ctx.strokeRect(14, 14, 228, 292);
      ctx.fillStyle = back ? "#f4e5c6" : "#573c65";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "90px system-ui, sans-serif";
      ctx.fillText(back ? "✦" : value === null ? "" : memorySymbols[value], 128, 162);
    });
  }
  private addTarget(
    object: THREE.Object3D,
    index: number,
    width: number,
    depth: number,
    y: number,
  ) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "duel-table3d-cell";
    button.addEventListener("click", (event) => {
      if ((event.detail === 0 || !this.suppressClick) && !this.model?.cells[index]?.disabled)
        this.onCell(index);
    });
    this.labels.append(button);
    this.targets.push({ object, button, width, depth, y });
  }
  private makeMemory() {
    this.block(this.table, [9.6, 0.06, 7.25], "#677b6a", [0, 0.03, 0]);
    for (let i = 0; i < 24; i++) {
      const g = new THREE.Group();
      g.position.set(((i % 6) - 2.5) * 1.48, 0.25, (Math.floor(i / 6) - 1.5) * 1.72);
      this.table.add(g);
      this.block(g, [1.24, 0.12, 1.52], "#dfcfae", [0, 0, 0], 0.08);
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(1.17, 1.45),
        new THREE.MeshStandardMaterial({ map: this.cardTexture(null, true), roughness: 0.85 }),
      );
      back.rotation.x = -Math.PI / 2;
      back.position.y = 0.067;
      g.add(back);
      const front = new THREE.Mesh(
        new THREE.PlaneGeometry(1.17, 1.45),
        new THREE.MeshStandardMaterial({ map: this.cardTexture(null), roughness: 0.85 }),
      );
      front.rotation.x = Math.PI / 2;
      front.position.y = -0.067;
      g.add(front);
      const value = this.model!.cells[i].value;
      g.rotation.z = value === null ? 0 : Math.PI;
      this.cards.push({ group: g, front, angle: g.rotation.z, value: null });
      this.addTarget(g, i, 1.24, 1.52, 0.07);
    }
  }
  private makeSea() {
    const m = this.model!;
    this.block(this.table, [8.9, 0.25, 8.9], "#4c6b78", [0, -0.03, 0], 0.1);
    this.block(this.table, [8.3, 0.06, 8.3], "#367485", [0, 0.11, 0]);
    for (let i = 0; i < 100; i++) {
      const x = ((i % 10) - 4.5) * 0.74,
        z = (Math.floor(i / 10) - 4.5) * 0.74;
      const tile = this.block(
        this.table,
        [0.708, 0.025, 0.708],
        (i + Math.floor(i / 10)) % 2 ? "#478592" : "#3f7c88",
        [x, 0.16, z],
        0.005,
      );
      tile.castShadow = false;
      this.addTarget(tile, i, 0.708, 0.708, 0.02);
      const status = m.cells[i].status;
      if (status && status !== "unknown") {
        const texture = this.texture(`mark:${status}`, (ctx) => {
          ctx.clearRect(0, 0, 256, 320);
          ctx.fillStyle = status === "miss" ? "#daf5ee" : status === "sunk" ? "#ffc7d0" : "#ffd3a1";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "bold 220px system-ui";
          ctx.fillText(status === "miss" ? "•" : "×", 128, 165);
        });
        const mark = new THREE.Mesh(
          new THREE.PlaneGeometry(0.55, 0.55),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }),
        );
        mark.rotation.x = -Math.PI / 2;
        mark.position.set(x, 0.9, z);
        mark.renderOrder = 2;
        this.table.add(mark);
      }
    }
    for (let j = 0; j < 10; j++)
      for (const vertical of [false, true]) {
        const text = vertical ? String(j + 1) : "АБВГДЕЖЗИК"[j];
        const t = this.texture(`coordinate:${text}`, (ctx) => {
          ctx.fillStyle = "#4c6b78";
          ctx.fillRect(0, 0, 256, 320);
          ctx.fillStyle = "#f2e7ce";
          ctx.font = "180px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, 128, 165);
        });
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(0.32, 0.32),
          new THREE.MeshBasicMaterial({ map: t }),
        );
        label.rotation.x = -Math.PI / 2;
        label.position.set(
          vertical ? -4.05 : (j - 4.5) * 0.74,
          0.17,
          vertical ? (j - 4.5) * 0.74 : -4.05,
        );
        this.table.add(label);
      }
    for (const cells of m.ships ?? []) {
      if (!cells.length) continue;
      const first = Math.min(...cells),
        vertical = cells.length > 1 && cells.every((c) => c % 10 === first % 10);
      const ship = makeDuelShip(
        cells.length,
        m.skinId,
        cells.every((c) => m.cells[c].status === "sunk"),
      );
      ship.root.position.set(
        ((first % 10) + (vertical ? 0 : (cells.length - 1) / 2) - 4.5) * 0.74,
        0.2,
        (Math.floor(first / 10) + (vertical ? (cells.length - 1) / 2 : 0) - 4.5) * 0.74,
      );
      if (vertical) ship.root.rotation.y = -Math.PI / 2;
      this.table.add(ship.root);
      this.ships.push(ship);
    }
  }
  update(model: DuelTableModel) {
    if (this.disposed) return;
    const previous = this.model;
    this.model = model;
    const avatar = getAvatar(model.opponent.avatarId).id;
    if (avatar !== this.avatarKey) {
      disposeObjects(this.people);
      const rig = makeSeatedAvatar(avatar, false);
      this.avatarEffects = rig.legendaryEffects;
      const group = new THREE.Group();
      group.add(rig.body);
      group.scale.setScalar(2.4);
      group.position.set(0, -3.12, -8.1);
      this.people.add(group);
      this.avatarKey = avatar;
    }
    const petKey = JSON.stringify(model.companions);
    if (petKey !== this.petKey) {
      disposeObjects(this.companions);
      this.petLabels.replaceChildren();
      this.petSpeech.hidden = true;
      this.petSpeechUntil = 0;
      this.pets = model.companions.map((companion) => {
        const actor = new PetModel(companion.pet.stage, companion.pet.species, 0.25);
        const near = companion.seat === "near";
        actor.root.scale.setScalar(near ? 1.05 : 1.25);
        // Seats follow owners even when only one player has a pet or the viewer spectates.
        // Both borders stay clear of the board and its clickable cells on narrow screens.
        actor.root.position.set(near ? -1.6 : 2.7, -0.14, near ? 5.15 : -5.35);
        this.companions.add(actor.root);
        const label = document.createElement(companion.isOwn ? "button" : "span");
        const description = `${PET_SPECIES_INFO[companion.pet.species].name}, ${PET_STAGES[companion.pet.stage]} · ${companion.ownerName}`;
        label.className = "duel-table3d-pet";
        label.setAttribute(
          "aria-label",
          `${companion.isOwn ? "Погладить питомца" : "Питомец"}: ${description}`,
        );
        label.title = description;
        if (label instanceof HTMLButtonElement) {
          label.type = "button";
          label.addEventListener("click", (event) => {
            if (event.detail !== 0 && this.suppressClick) return;
            this.petSpeech.textContent = actor.react(performance.now());
            this.petSpeechUntil = performance.now() + 2400;
            this.requestFrame();
          });
        } else label.setAttribute("role", "img");
        this.petLabels.append(label);
        return { actor, label };
      });
      this.petKey = petKey;
    }
    const key = `${model.kind}:${model.boardKey}`;
    const changedBoard = this.boardKey !== key;
    const fleetKey = JSON.stringify([model.ships, model.skinId, model.cells.map((c) => c.status)]);
    let focusedCell = -1;
    if (changedBoard || (model.kind === "battleship" && fleetKey !== this.fleetKey)) {
      if (!changedBoard)
        focusedCell = this.targets.findIndex((target) => target.button === document.activeElement);
      disposeObjects(this.table);
      this.labels.replaceChildren();
      this.targets = [];
      this.cards = [];
      this.ships = [];
      this.effects = [];
      if (model.kind === "memory") this.makeMemory();
      else this.makeSea();
      this.boardKey = key;
      this.fleetKey = fleetKey;
      if (!changedBoard && previous && model.kind === "battleship" && !this.reduced)
        model.cells.forEach((c, i) => {
          if (previous.cells[i]?.status === "unknown" && c.status !== "unknown")
            this.splash(i, c.status === "miss");
        });
    }
    model.cells.forEach((cell, i) => {
      const target = this.targets[i];
      if (target) {
        target.button.disabled = cell.disabled;
        target.button.setAttribute("aria-label", cell.label);
      }
      const card = this.cards[i];
      if (card) {
        card.angle = cell.value === null ? 0 : Math.PI;
        if (card.value !== cell.value) {
          card.front.material.map = this.cardTexture(cell.value);
          card.value = cell.value;
        }
        card.front.material.color.set(cell.matched ? "#c7edbb" : "#ffffff");
        if (this.reduced) card.group.rotation.z = card.angle;
      }
    });
    if (focusedCell >= 0 && !this.targets[focusedCell]?.button.disabled)
      this.targets[focusedCell].button.focus({ preventScroll: true });
    this.requestFrame();
  }
  private splash(index: number, water: boolean) {
    const group = new THREE.Group();
    group.position.set(((index % 10) - 4.5) * 0.74, 0.25, (Math.floor(index / 10) - 4.5) * 0.74);
    for (let i = 0; i < 10; i++) {
      const bit = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 6, 4),
        new THREE.MeshBasicMaterial({ color: water ? "#b9f0ef" : "#f5b071" }),
      );
      group.add(bit);
    }
    this.table.add(group);
    this.effects.push({ group, start: performance.now() });
  }
  setOverview(value: boolean) {
    this.overview = value;
    this.angle = 0;
    this.positionCamera();
  }
  private resize() {
    if (this.disposed) return;
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.positionCamera();
  }
  private positionCamera() {
    const factor = Math.max(1, 370 / this.width);
    if (this.overview) {
      this.camera.position.set(0, 18 * factor, 0.15);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.camera.position.set(
        Math.sin(this.angle) * 12 * factor,
        9 * factor,
        Math.cos(this.angle) * 12 * factor,
      );
      this.camera.lookAt(0, 0.3, -1);
    }
    this.requestFrame();
  }
  private project() {
    for (const { actor, label } of this.pets) {
      const center = actor.getInteractionCenter(new THREE.Vector3());
      const edge = new THREE.Vector3(actor.getInteractionRadius(), 0, 0)
        .applyQuaternion(this.camera.quaternion)
        .add(center)
        .project(this.camera);
      center.project(this.camera);
      const size = Math.max(34, Math.abs(edge.x - center.x) * this.width);
      label.hidden = center.z < -1 || center.z > 1;
      Object.assign(label.style, {
        left: `${((center.x + 1) * this.width) / 2 - size / 2}px`,
        top: `${((1 - center.y) * this.height) / 2 - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
    }
    for (const t of this.targets) {
      const points = [
        [-t.width / 2, t.y, -t.depth / 2],
        [t.width / 2, t.y, -t.depth / 2],
        [t.width / 2, t.y, t.depth / 2],
        [-t.width / 2, t.y, t.depth / 2],
      ].map((v) => {
        const p = new THREE.Vector3(...(v as Triple));
        t.object.localToWorld(p);
        p.project(this.camera);
        return [((p.x + 1) * this.width) / 2, ((1 - p.y) * this.height) / 2];
      });
      const left = Math.min(...points.map((p) => p[0])),
        top = Math.min(...points.map((p) => p[1]));
      const width = Math.max(0.01, Math.max(...points.map((p) => p[0])) - left),
        height = Math.max(0.01, Math.max(...points.map((p) => p[1])) - top);
      Object.assign(t.button.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        clipPath: `polygon(${points.map((p) => `${((p[0] - left) / width) * 100}% ${((p[1] - top) / height) * 100}%`).join(",")})`,
      });
    }
  }
  private requestFrame() {
    if (!this.frame && !this.disposed && !document.hidden)
      this.frame = requestAnimationFrame(this.render);
  }
  private render = (time: number) => {
    this.frame = 0;
    if (this.disposed) return;
    const animated =
      !this.reduced &&
      (!!this.pets.length || !!this.avatarEffects || this.ships.some((ship) => ship.animated));
    if (animated && time - this.lastFrame < 1000 / 30) {
      this.requestFrame();
      return;
    }
    const dt = Math.min(0.05, (time - this.lastFrame) / 1000);
    this.lastFrame = time;
    this.animationTime += dt;
    this.avatarEffects?.frame(this.animationTime, this.reduced);
    for (const ship of this.ships) ship.frame(this.animationTime, this.reduced);
    for (const { actor } of this.pets) actor.frame(time, this.reduced);
    this.petSpeech.hidden = time >= this.petSpeechUntil;
    let moving = false;
    for (const card of this.cards) {
      const delta = card.angle - card.group.rotation.z;
      if (Math.abs(delta) > 0.005) {
        card.group.rotation.z += delta * Math.min(1, dt * 13);
        moving = true;
      } else card.group.rotation.z = card.angle;
      card.group.position.y = 0.25 + Math.sin(card.group.rotation.z) * 0.4;
    }
    this.effects = this.effects.filter((effect) => {
      const t = (time - effect.start) / 800;
      if (t >= 1) {
        effect.group.removeFromParent();
        disposeObjects(effect.group);
        return false;
      }
      effect.group.children.forEach((bit, i) => {
        bit.position.set(
          Math.cos(i * 2.4) * t * 0.6,
          Math.sin(t * Math.PI) * 0.9,
          Math.sin(i * 2.4) * t * 0.6,
        );
        bit.scale.setScalar(1 - t);
      });
      return true;
    });
    this.renderer.render(this.scene, this.camera);
    this.project();
    if (moving || this.effects.length || animated) this.requestFrame();
  };
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.suppressClick = false;
    this.drag = { x: event.clientX, y: event.clientY, angle: this.angle, moved: false };
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.drag || this.overview) return;
    const dx = event.clientX - this.drag.x;
    if (Math.abs(dx) > 7) this.drag.moved = true;
    if (this.drag.moved) {
      this.angle = Math.max(-0.42, Math.min(0.42, this.drag.angle - dx * 0.004));
      this.positionCamera();
    }
  };
  private pointerUp = () => {
    this.suppressClick = this.drag?.moved ?? false;
    this.drag = null;
  };
  private pointerCancel = () => {
    this.drag = null;
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.onFail();
  };
  private visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    } else this.requestFrame();
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.host.removeEventListener("pointerdown", this.pointerDown);
    this.host.removeEventListener("pointermove", this.pointerMove);
    this.host.removeEventListener("pointerup", this.pointerUp);
    this.host.removeEventListener("pointercancel", this.pointerCancel);
    this.host.removeEventListener("pointerleave", this.pointerCancel);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost);
    disposeObjects(this.scene);
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.host.replaceChildren();
  }
}
