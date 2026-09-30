import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Batch direct rigid parts only; nested joints, named objects and card faces stay independent. */
export function mergeRigidParts(group: THREE.Group) {
  const batches = new Map<string, THREE.Mesh[]>();
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh) || child.name || !child.visible) continue;
    const material = child.material;
    if (
      !(material instanceof THREE.MeshStandardMaterial) ||
      material.transparent ||
      material.map ||
      material.normalMap ||
      material.alphaMap ||
      material.roughnessMap ||
      material.metalnessMap ||
      material.aoMap ||
      material.emissiveMap ||
      material.bumpMap ||
      material.displacementMap ||
      material.vertexColors
    )
      continue;
    const key = JSON.stringify([
      material.color.getHex(),
      material.roughness,
      material.metalness,
      material.emissive.getHex(),
      material.emissiveIntensity,
      material.side,
      material.flatShading,
      child.castShadow,
      child.receiveShadow,
    ]);
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key)!.push(child);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map((mesh) => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((piece) => piece.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, meshes[0].material);
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    for (const mesh of meshes) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
    geometry.computeBoundingSphere();
    group.add(merged);
  }
}
