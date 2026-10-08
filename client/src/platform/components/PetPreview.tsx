import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PetModel, disposePetModel } from "../../games/shared/table3d/PetModel";
import { PET_SPECIES_INFO, type PetSpecies } from "../../../../shared/platform/pet";

export default function PetPreview({
  stage,
  species,
  interactive = true,
}: {
  stage: number;
  species: PetSpecies;
  interactive?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const actor = useRef<PetModel | null>(null);
  const [failed, setFailed] = useState(false);
  const [reaction, setReaction] = useState("");
  const clearMessage = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);
    setReaction("");
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    camera.position.set(0, 1.3, 3.65);
    camera.lookAt(0, 0.68, 0);
    scene.add(new THREE.HemisphereLight(0xfff4e7, 0x56607e, 1.3));
    const light = new THREE.DirectionalLight(0xfff9e8, 2.4);
    light.position.set(-3, 4, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = light.shadow.camera.bottom = -1.4;
    light.shadow.camera.right = light.shadow.camera.top = 1.4;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 12;
    light.shadow.normalBias = 0.015;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xe0f2ff, 0.5);
    fill.position.set(3, 1, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xbdfff0, 0.85);
    rim.position.set(0, 3, -3);
    scene.add(rim);
    const pet = new PetModel(stage, species);
    actor.current = pet;
    scene.add(pet.root);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.72, 0.12, 48),
      new THREE.MeshStandardMaterial({ color: "#334465", roughness: 0.85 }),
    );
    base.position.y = -0.06;
    base.receiveShadow = true;
    scene.add(base);
    element.appendChild(renderer.domElement);
    const resize = () => {
      renderer.setSize(element.clientWidth, element.clientHeight);
      camera.aspect = element.clientWidth / Math.max(1, element.clientHeight);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      lastFrame = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || time - lastFrame < 1000 / 60) return;
      lastFrame = time;
      pet.frame(time, reduced.matches, !interactive);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(clearMessage.current);
      observer.disconnect();
      actor.current = null;
      disposePetModel(pet.root);
      base.geometry.dispose();
      base.material.dispose();
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [stage, species, interactive]);
  const react = () => {
    if (!interactive) return;
    setReaction(actor.current?.react(performance.now()) ?? PET_SPECIES_INFO[species].reaction);
    clearTimeout(clearMessage.current);
    clearMessage.current = setTimeout(() => setReaction(""), 2400);
  };
  return (
    <div className="pet-preview-wrap">
      <button
        type="button"
        className="pet-interact"
        disabled={!interactive}
        aria-label={`Погладить питомца: ${PET_SPECIES_INFO[species].name}${stage === 0 ? " в яйце" : ""}`}
        onClick={react}
      >
        <div className="pet-preview" ref={host} aria-hidden="true">
          {failed && (
            <span className="pet-fallback">
              {stage === 0 ? "🥚" : PET_SPECIES_INFO[species].emoji}
            </span>
          )}
        </div>
      </button>
      <span className={`pet-reaction${reaction ? " is-active" : ""}`} role="status">
        {reaction || (interactive ? "Нажмите на питомца — он ответит" : "")}
      </span>
    </div>
  );
}
