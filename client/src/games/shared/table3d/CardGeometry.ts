import * as THREE from "three";

export const CARD_WIDTH = 0.66;
export const CARD_HEIGHT = 0.94;
export const CARD_THICKNESS = 0.004;
export type CardMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material[]>;

/** Rounded paper silhouette with separate face, back and edge materials. */
export function makeCardGeometry() {
  const w = CARD_WIDTH / 2;
  const h = CARD_HEIGHT / 2;
  const r = 0.045;
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const indexedCap = new THREE.ShapeGeometry(shape, 6);
  const cap = indexedCap.toNonIndexed();
  indexedCap.dispose();
  const source = cap.getAttribute("position");
  const vertices: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();
  for (const side of [1, -1]) {
    const start = vertices.length / 3;
    for (let i = 0; i < source.count; i++) {
      const index = side === 1 ? i : Math.floor(i / 3) * 3 + (2 - (i % 3));
      const x = source.getX(index);
      const y = source.getY(index);
      vertices.push(x, (side * CARD_THICKNESS) / 2, -y);
      uvs.push((side * x) / CARD_WIDTH + 0.5, y / CARD_HEIGHT + 0.5);
    }
    geometry.addGroup(start, source.count, side === 1 ? 2 : 3);
  }
  const edgeStart = vertices.length / 3;
  const outline = shape.getPoints(6);
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i];
    const b = outline[i + 1];
    for (const [point, side] of [
      [a, 1],
      [a, -1],
      [b, 1],
      [b, 1],
      [a, -1],
      [b, -1],
    ] as const) {
      vertices.push(point.x, (side * CARD_THICKNESS) / 2, -point.y);
      uvs.push(0, 0);
    }
  }
  geometry.addGroup(edgeStart, vertices.length / 3 - edgeStart, 0);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  cap.dispose();
  return geometry;
}
