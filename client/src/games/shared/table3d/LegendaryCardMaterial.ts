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
         float foilTravel = fract(legendaryFoilTime / 3.6);
         float foilPosition = vMapUv.x * 0.6 + (1.0 - vMapUv.y) * 0.4;
         float foilDistance = (foilPosition - mix(-0.3, 1.3, foilTravel)) * 8.0;
         float foilBand = exp(-foilDistance * foilDistance);
         float foilDecoration = texture2D(legendaryFoilMask, vMapUv).a;
         float foilStrength = foilDecoration * foilBand * 0.85 * legendaryFoilEnabled;
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.91, 0.65), foilStrength);
         float gemGlint = pow(0.5 + 0.5 * sin(legendaryFoilTime * 2.618), 3.0);
         float gemDecoration = texture2D(legendarySparkMask, vMapUv).a;
         diffuseColor.rgb += vec3(0.6, 0.45, 0.2) * gemDecoration * gemGlint * legendaryFoilEnabled;
       #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
       #ifdef USE_MAP
         totalEmissiveRadiance += vec3(0.9, 0.57, 0.18)
           * (foilDecoration * foilBand * 0.5 + gemDecoration * gemGlint * 0.75)
           * legendaryFoilEnabled;
       #endif`,
    );
  };
  material.customProgramCacheKey = () => "partyside-legendary-card-foil-v2";
}
