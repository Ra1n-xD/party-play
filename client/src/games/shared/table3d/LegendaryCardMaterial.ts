import * as THREE from "three";

export interface LegendaryCardClock {
  time: { value: number };
  enabled: { value: number };
}

/** Foil changes only printed decoration; gameplay focus/selection keeps its emissive material. */
export function addLegendaryCardFoil(
  material: THREE.MeshStandardMaterial,
  clock: LegendaryCardClock,
  foilMask: THREE.Texture,
  sparkMask: THREE.Texture,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.legendaryFoilTime = clock.time;
    shader.uniforms.legendaryFoilEnabled = clock.enabled;
    shader.uniforms.legendaryFoilMask = { value: foilMask };
    shader.uniforms.legendarySparkMask = { value: sparkMask };
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       uniform float legendaryFoilTime;
       uniform float legendaryFoilEnabled;
       uniform sampler2D legendaryFoilMask;
       uniform sampler2D legendarySparkMask;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       #ifdef USE_MAP
         float foilPhase = fract(legendaryFoilTime / 8.0);
         float foilTravel = smoothstep(0.18, 0.58, foilPhase);
         float foilPosition = vMapUv.x * 0.6 + (1.0 - vMapUv.y) * 0.4;
         float foilDistance = (foilPosition - mix(-0.25, 1.25, foilTravel)) * 12.0;
         float foilBand = exp(-foilDistance * foilDistance);
         float foilDecoration = texture2D(legendaryFoilMask, vMapUv).a;
         float foilStrength = foilDecoration * foilBand * 0.4 * legendaryFoilEnabled;
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.91, 0.65), foilStrength);
         float gemGlint = pow(max(0.0, sin(legendaryFoilTime * 0.9)), 10.0);
         float gemDecoration = texture2D(legendarySparkMask, vMapUv).a;
         diffuseColor.rgb += vec3(0.32, 0.27, 0.15) * gemDecoration * gemGlint * legendaryFoilEnabled;
       #endif`,
    );
  };
  material.customProgramCacheKey = () => "partyside-legendary-card-foil-v1";
}
