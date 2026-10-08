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
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(0, 1.15, 3.4);
    camera.lookAt(0, 0.6, 0);
    scene.add(new THREE.HemisphereLight(0xe3fff6, 0x45536a, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-2, 3, 4);
    scene.add(light);
    const pet = new PetModel(stage, species);
    actor.current = pet;
    scene.add(pet.root);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.72, 0.12, 48),
      new THREE.MeshStandardMaterial({ color: "#334465" }),
    );
    base.position.y = -0.06;
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
      renderer.dispose();
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
