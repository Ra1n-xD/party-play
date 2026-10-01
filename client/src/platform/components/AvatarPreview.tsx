import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { type AvatarId } from "../../../../shared/platform/avatars";
import { makeSeatedAvatar } from "../../games/shared/table3d/AvatarModel";
import { roundedPart } from "../../games/shared/table3d/AvatarParts";
import { AvatarPortrait } from "./AvatarPortrait";

export default function AvatarPreview({ avatarId }: { avatarId: AvatarId }) {
  const host = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setUnavailable(true);
      return;
    }
    const container = host.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff1d3, 0x777191, 2.7));
    const light = new THREE.DirectionalLight(0xfff5e4, 3);
    light.position.set(3, 5, 4);
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xb0ddeb, 1.4);
    fill.position.set(-3, 2, -3);
    scene.add(fill);
    const figure = new THREE.Group();
    const { body } = makeSeatedAvatar(avatarId, false);
    figure.add(body);
    const seat = roundedPart(
      [1, 0.18, 0.9],
      new THREE.MeshStandardMaterial({ color: 0x493e51, roughness: 0.85 }),
      0.07,
    );
    seat.position.set(0, 0.76, 0);
    figure.add(seat);
    const back = roundedPart([1, 1.1, 0.18], seat.material, 0.08);
    back.position.set(0, 1.2, -0.4);
    figure.add(back);
    figure.rotation.y = -0.32;
    scene.add(figure);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    camera.position.set(0, 2.05, 5.4);
    camera.lookAt(0, 1.5, 0);
    const render = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    // The lobby renders only on selection/resize; it never keeps a second animation loop running.
    const observer = new ResizeObserver(render);
    observer.observe(container);
    render();
    return () => {
      observer.disconnect();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((entry) => materials.add(entry));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((entry) => entry.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [avatarId]);
  return unavailable ? (
    <AvatarPortrait avatarId={avatarId} />
  ) : (
    <div className="show-avatar-canvas" ref={host} aria-hidden="true" />
  );
}
