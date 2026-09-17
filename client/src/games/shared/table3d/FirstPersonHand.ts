import * as THREE from "three";
import { CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS, type CardMesh } from "./CardGeometry";
import { makeAvatarHand, limbBetween, roundedPart } from "./AvatarParts";

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
  private readonly cards = new Map<string, HeldCard>();
  private readonly inputs = document.createElement("div");
  private readonly caption = document.createElement("div");
  private readonly previous = document.createElement("button");
  private readonly next = document.createElement("button");
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
    const sleeveMaterial = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
    const cuffMaterial = new THREE.MeshStandardMaterial({ color: 0xeee9dc, roughness: 0.85 });
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.x = side * 0.23;
      this.grip.add(arm);
      const hand = makeAvatarHand(skin, -side, true);
      hand.position.set(0, -0.64, -1.555);
      hand.rotation.z = -side * 0.16;
      arm.add(hand);
      const wrist = new THREE.Vector3(side * 0.02, -0.73, -1.54);
      limbBetween(arm, new THREE.Vector3(side * 0.2, -1.04, -1.26), wrist, 0.074, sleeveMaterial);
      const cuff = roundedPart([0.113, 0.055, 0.095], cuffMaterial, 0.014);
      cuff.position.copy(wrist);
      cuff.rotation.z = -side * 0.36;
      arm.add(cuff);
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

  private layout() {
    const maxVisible = this.width <= 680 ? 5 : 9;
    const count = Math.min(this.hand.length, maxVisible);
    const focus = Math.max(
      0,
      this.hand.findIndex((card) => card.focused),
    );
    const start = Math.max(0, Math.min(this.hand.length - count, focus - Math.floor(count / 2)));
    const scale = Math.min(1, this.camera.aspect * 1.1);
    const spacing = Math.min(0.105, 0.7 / Math.max(count - 1, 1)) * scale;
    const centerY = -0.57;
    this.grip.scale.setScalar(scale);
    this.grip.position.set(0, -0.57 * (1 - scale), -1.5 * (1 - scale));
    const gripSpread = Math.min(
      0.23,
      Math.max(0.085, ((count - 1) * spacing) / (2 * scale) - 0.01),
    );
    this.grip.children.forEach((part) => {
      if (part instanceof THREE.Group) part.position.x = Math.sign(part.position.x) * gripSpread;
    });
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
    this.enabled = enabled;
    this.inputs.style.pointerEvents = enabled ? "" : "none";
    this.inputs.inert = !enabled;
  }

  render(renderer: THREE.WebGLRenderer, smoothing: number) {
    if (!this.hand.length) return;
    this.cards.forEach((entry) => {
      if (!entry.pivot.visible) return;
      entry.pivot.position.lerp(entry.target, smoothing);
      entry.pivot.rotation.z += (entry.angle - entry.pivot.rotation.z) * smoothing;
    });
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.cards.forEach((entry) => {
      if (!entry.pivot.visible) return;
      const points = this.corners.map((corner) => {
        const point = entry.mesh.localToWorld(corner.clone()).project(this.camera);
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
