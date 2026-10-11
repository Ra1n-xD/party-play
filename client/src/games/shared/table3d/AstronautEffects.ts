import * as THREE from "three";
import { roundedPart } from "./AvatarParts";

export interface AvatarLegendaryEffectsRig {
  frame(seconds: number, reducedMotion: boolean): void;
}

/** Small suit lights stay on their panels; no particles or lights affect nearby cards. */
export function makeAstronautTelemetry(
  parent: THREE.Group,
  position: [number, number, number],
  width = 0.024,
  spacing = 0.062,
): AvatarLegendaryEffectsRig {
  const lights = [0x8ee7e8, 0xf4cf7b, 0xa8dfc2].map((color, index) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.2,
      roughness: 0.35,
      metalness: 0.15,
    });
    const light = roundedPart([width, width * 0.7, width * 0.26], material, width * 0.14);
    light.name = `astronaut-telemetry-${index}`;
    light.position.set(position[0] + (index - 1) * spacing, position[1], position[2]);
    parent.add(light);
    return material;
  });

  return {
    frame(seconds, reducedMotion) {
      lights.forEach((material, index) => {
        const phase = (((seconds / 4.2 - index * 0.19) % 1) + 1) % 1;
        const glow = reducedMotion ? 0.25 : Math.max(0, Math.sin(phase * Math.PI * 2)) ** 4;
        material.emissiveIntensity = 0.16 + glow * 0.48;
      });
    },
  };
}

export function makeAstronautEffects(
  head: THREE.Group,
  model: THREE.Group,
): AvatarLegendaryEffectsRig {
  const reflection = new THREE.Group();
  reflection.name = "astronaut-visor-reflection";
  reflection.position.set(0, 0.018, -0.014);
  reflection.scale.y = 1.1;
  const reflections = [
    { width: 0.2, color: 0x8bdae9, opacity: 0.09 },
    { width: 0.065, color: 0xe0f7ff, opacity: 0.2 },
  ].map(({ width, color, opacity }) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const arc = new THREE.Mesh(
      new THREE.SphereGeometry(0.339, 12, 24, Math.PI / 2 - width / 2, width, 0.85, 1.35),
      material,
    );
    arc.name = "astronaut-visor-glint";
    arc.renderOrder = 1;
    reflection.add(arc);
    return { material, opacity };
  });
  head.add(reflection);
  const telemetry = makeAstronautTelemetry(model, [0, 1.568, 0.245]);

  return {
    frame(seconds, reducedMotion) {
      const phase = (((seconds / 8.4) % 1) + 1) % 1;
      const sweep = Math.min(1, phase * 1.6);
      reflection.rotation.y = reducedMotion ? -0.18 : -0.6 + sweep * 1.2;
      const brightness = reducedMotion ? 0.65 : Math.sin(sweep * Math.PI) ** 2;
      reflections.forEach(({ material, opacity }) => {
        material.opacity = opacity * brightness;
      });
      telemetry.frame(seconds, reducedMotion);
    },
  };
}
