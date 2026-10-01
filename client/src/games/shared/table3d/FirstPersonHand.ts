import * as THREE from "three";
import { CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS, type CardMesh } from "./CardGeometry";
import { HAND_CARD_EDGE_Y, makeAvatarHand, limbBetween, roundedPart } from "./AvatarParts";

export interface CardFace {
  rank: string;
  suit: string;
  red: boolean;
  color?: "red" | "yellow" | "green" | "blue" | "wild";
}

export interface TableHandCard extends CardFace {
  id: string;
  label: string;
  focused: boolean;
  selected: boolean;
  playable: boolean;
  selectable: boolean;
}

interface HeldCard {
  mesh: CardMesh;
  pivot: THREE.Group;
  target: THREE.Vector3;
  angle: number;
  button: HTMLButtonElement;
}

/** A camera-local hand, drawn after the room so looking around cannot clip it into the table. */
export class FirstPersonHand {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.05, 10);
  private readonly grip = new THREE.Group();
  private readonly grips: { root: THREE.Group; side: number }[] = [];
  private gripScale = 1;
  private readonly cards = new Map<string, HeldCard>();
  private readonly inputs = document.createElement("div");
  private readonly caption = document.createElement("div");
  private readonly previous = document.createElement("button");
  private readonly next = document.createElement("button");
  private readonly projectedPoint = new THREE.Vector3();
  private readonly gripPoint = new THREE.Vector3();
  private readonly gripOffset = new THREE.Vector3();
  private readonly corners = [
    new THREE.Vector3(-CARD_WIDTH / 2, CARD_THICKNESS / 2, -CARD_HEIGHT / 2),
    new THREE.Vector3(CARD_WIDTH / 2, CARD_THICKNESS / 2, -CARD_HEIGHT / 2),
    new THREE.Vector3(CARD_WIDTH / 2, CARD_THICKNESS / 2, CARD_HEIGHT / 2),
    new THREE.Vector3(-CARD_WIDTH / 2, CARD_THICKNESS / 2, CARD_HEIGHT / 2),
  ];
  private hand: TableHandCard[] = [];
  private width = 1;
  private height = 1;
  private gripKey = "";
  private enabled = true;
  private overview = false;
  private hitAreasDirty = true;

  constructor(
    host: HTMLElement,
    private readonly makeCard: (face: CardFace) => CardMesh,
    private readonly disposeObject: (object: THREE.Object3D) => void,
    private readonly onFocus: (id: string) => void,
    private readonly onSelect: (id: string) => void,
  ) {
    this.scene.add(this.grip, new THREE.HemisphereLight(0xfff5e8, 0x56616c, 1.7));
    const light = new THREE.DirectionalLight(0xfff3e5, 1.6);
    light.position.set(-1, 3, 4);
    this.scene.add(light);
    this.inputs.className = "table3d-hand-inputs";
    this.inputs.setAttribute("role", "group");
    this.inputs.setAttribute("aria-label", "Карты в вашей руке");
    this.caption.className = "table3d-hand-caption";
    this.caption.setAttribute("role", "status");
    this.previous.className = this.next.className = "table3d-hand-step";
    this.next.classList.add("is-next");
    this.previous.type = this.next.type = "button";
    this.previous.textContent = "‹";
    this.next.textContent = "›";
    this.previous.setAttribute("aria-label", "Предыдущая карта");
    this.next.setAttribute("aria-label", "Следующая карта");
    this.previous.onclick = () => this.step(-1);
    this.next.onclick = () => this.step(1);
    this.inputs.append(this.previous, this.caption, this.next);
    host.append(this.inputs);
  }

  private step(direction: number) {
    if (!this.enabled || !this.hand.length) return;
    const index = Math.max(
      0,
      this.hand.findIndex((card) => card.focused),
    );
    this.onFocus(this.hand[(index + direction + this.hand.length) % this.hand.length].id);
  }

  private makeGrip(skin: number, shirt: number) {
    const key = `${skin}:${shirt}`;
    if (this.gripKey === key) return;
    this.gripKey = key;
    this.disposeObject(this.grip);
    this.grip.clear();
    this.grips.length = 0;
    const sleeveMaterial = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
    const cuffMaterial = new THREE.MeshStandardMaterial({ color: 0xeee9dc, roughness: 0.85 });
    for (const side of [-1, 1]) {
      const anchor = new THREE.Group();
      this.grip.add(anchor);
      this.grips.push({ root: anchor, side });
      const hand = makeAvatarHand(skin, -side, true);
      anchor.add(hand);
      const wrist = new THREE.Vector3(0, -0.155, -0.045);
      limbBetween(
        anchor,
        new THREE.Vector3(side * 0.15, -0.45, 0.22),
        wrist,
        0.078,
        sleeveMaterial,
        0.051,
      );
      const cuff = roundedPart([0.1, 0.058, 0.082], cuffMaterial, 0.015);
      cuff.position.copy(wrist);
      anchor.add(cuff);
    }
  }

  update(hand: TableHandCard[], skin: number, shirt: number) {
    this.hand = hand;
    this.inputs.hidden = hand.length === 0;
    this.grip.visible = hand.length > 0;
    if (hand.length) this.makeGrip(skin, shirt);
    const ids = new Set(hand.map((card) => card.id));
    this.cards.forEach((entry, id) => {
      if (ids.has(id)) return;
      entry.button.remove();
      this.scene.remove(entry.pivot);
      this.disposeObject(entry.pivot);
      this.cards.delete(id);
    });
    hand.forEach((card) => {
      let entry = this.cards.get(card.id);
      if (!entry) {
        const mesh = this.makeCard(card);
        mesh.rotation.x = Math.PI / 2;
        mesh.scale.setScalar(0.34);
        mesh.position.y = 0.12;
        mesh.castShadow = mesh.receiveShadow = false;
        const pivot = new THREE.Group();
        pivot.position.set(0, -0.85, -1.52);
        pivot.add(mesh);
        this.scene.add(pivot);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table3d-hand-card";
        button.oncontextmenu = (event) => event.preventDefault();
        button.dataset.tableHandCard = card.id;
        button.onpointermove = (event) => {
          if (
            this.enabled &&
            event.pointerType !== "touch" &&
            (event.movementX !== 0 || event.movementY !== 0)
          )
            this.onFocus(card.id);
        };
        button.onfocus = () => this.onFocus(card.id);
        button.onclick = () => {
          if (!this.enabled) return;
          this.onFocus(card.id);
          if (this.hand.find((item) => item.id === card.id)?.selectable) this.onSelect(card.id);
        };
        this.inputs.append(button);
        entry = { mesh, pivot, button, target: new THREE.Vector3(), angle: 0 };
        this.cards.set(card.id, entry);
      }
      entry.button.setAttribute("aria-label", card.label);
      entry.button.setAttribute("aria-pressed", String(card.selected));
      entry.button.setAttribute("aria-disabled", String(!card.selectable));
      entry.button.tabIndex = card.focused ? 0 : -1;
      const face = entry.mesh.material[2] as THREE.MeshStandardMaterial;
      face.color.set(card.playable ? 0xffffff : 0xd7d4cc);
      face.emissive.set(card.selected ? 0xc99538 : card.focused ? 0xa88748 : 0x000000);
      face.emissiveIntensity = card.selected ? 0.26 : card.focused ? 0.14 : 0;
    });
    this.layout();
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.layout();
  }

  setOverview(overview: boolean) {
    this.overview = overview;
    this.camera.fov = overview ? 62 : 48;
    this.camera.updateProjectionMatrix();
    this.layout();
  }

  private layout() {
    this.hitAreasDirty = true;
    const maxVisible = this.width <= 680 ? 5 : 9;
    const count = Math.min(this.hand.length, maxVisible);
    const focus = Math.max(
      0,
      this.hand.findIndex((card) => card.focused),
    );
    const start = Math.max(0, Math.min(this.hand.length - count, focus - Math.floor(count / 2)));
    const scale = Math.min(1, this.camera.aspect * 1.1);
    const spacing = Math.min(0.105, 0.7 / Math.max(count - 1, 1)) * scale;
    const offsetY = this.overview ? -0.2 : 0;
    const centerY = -0.57 + offsetY;
    this.gripScale = scale;
    this.hand.forEach((card, index) => {
      const entry = this.cards.get(card.id)!;
      const visible = index >= start && index < start + count;
      entry.pivot.visible = visible;
      entry.button.hidden = !visible;
      if (!visible) return;
      const offset = index - start - (count - 1) / 2;
      const lift = card.selected ? 0.13 : card.focused ? 0.055 : 0;
      entry.target.set(
        offset * spacing,
        centerY - Math.abs(offset) * 0.009 + lift,
        -1.52 + (index - start) * 0.002 + (card.focused ? 0.025 : 0) + (card.selected ? 0.02 : 0),
      );
      entry.angle = -offset * 0.085;
      entry.mesh.scale.setScalar(0.34 * scale);
      entry.mesh.position.y = 0.12 * scale;
      entry.button.style.zIndex = String(
        index + (card.focused ? 150 : 0) + (card.selected ? 300 : 0),
      );
    });
    const focused = this.hand[focus];
    this.caption.textContent = focused
      ? `${focus + 1} / ${this.hand.length} · ${focused.label}${this.hand.some((card) => card.selected) ? ` · выбрано: ${this.hand.filter((card) => card.selected).length}` : ""}`
      : "";
    this.previous.hidden = this.next.hidden = this.hand.length < 2;
  }

  setInteractive(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.inputs.style.pointerEvents = enabled ? "" : "none";
    this.inputs.inert = !enabled;
  }

  render(renderer: THREE.WebGLRenderer, smoothing: number) {
    if (!this.hand.length) return;
    let moved = this.hitAreasDirty;
    this.cards.forEach((entry) => {
      if (!entry.pivot.visible) return;
      const distance = entry.pivot.position.distanceToSquared(entry.target);
      const angle = Math.abs(entry.angle - entry.pivot.rotation.z);
      if (distance > 0.00000001 || angle > 0.0001) {
        entry.pivot.position.lerp(entry.target, smoothing);
        entry.pivot.rotation.z += (entry.angle - entry.pivot.rotation.z) * smoothing;
        moved = true;
      } else if (distance > 0 || angle > 0) {
        entry.pivot.position.copy(entry.target);
        entry.pivot.rotation.z = entry.angle;
        moved = true;
      }
    });
    // The hand has its own camera: settled cards keep the same hit areas while looking around.
    if (moved) {
      this.scene.updateMatrixWorld(true);
      const visible = this.hand
        .map((card) => this.cards.get(card.id)!)
        .filter((entry) => entry.pivot.visible);
      for (const { root, side } of this.grips) {
        const card = side < 0 ? visible[0] : visible[visible.length - 1];
        if (!card) continue;
        // Grip the outer corner: lifting an edge card must not push the thumb into its neighbour.
        root.quaternion.copy(card.pivot.quaternion);
        root.scale.setScalar(this.gripScale);
        this.gripPoint.set(
          side * (CARD_WIDTH / 2 + 0.028 / 0.34),
          CARD_THICKNESS / 2,
          CARD_HEIGHT / 2,
        );
        root.position.copy(card.mesh.localToWorld(this.gripPoint));
        this.gripOffset
          .set(0, HAND_CARD_EDGE_Y * this.gripScale, 0)
          .applyQuaternion(root.quaternion);
        root.position.sub(this.gripOffset);
      }
      this.grip.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);
      this.cards.forEach((entry) => {
        if (!entry.pivot.visible) return;
        const points = this.corners.map((corner) => {
          const point = entry.mesh
            .localToWorld(this.projectedPoint.copy(corner))
            .project(this.camera);
          return { x: ((point.x + 1) * this.width) / 2, y: ((1 - point.y) * this.height) / 2 };
        });
        const left = Math.min(...points.map((point) => point.x));
        const top = Math.min(...points.map((point) => point.y));
        const width = Math.max(...points.map((point) => point.x)) - left;
        const height = Math.max(...points.map((point) => point.y)) - top;
        entry.button.style.transform = `translate(${left}px, ${top}px)`;
        entry.button.style.width = `${width}px`;
        entry.button.style.height = `${height}px`;
        entry.button.style.clipPath = `polygon(${points.map((point) => `${point.x - left}px ${point.y - top}px`).join(",")})`;
      });
      this.hitAreasDirty = false;
    }
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  dispose() {
    this.inputs.remove();
    this.disposeObject(this.scene);
    this.cards.clear();
  }
}
