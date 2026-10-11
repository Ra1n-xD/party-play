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
    const { body, legendaryEffects } = makeSeatedAvatar(avatarId, false);
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
    const render = () => renderer.render(scene, camera);
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let frame: number | null = null;
    let previousTime: number | null = null;
    let seconds = 0;
    const canAnimate = () =>
      legendaryEffects &&
      visible &&
      !document.hidden &&
      document.hasFocus() &&
      !reducedMotion.matches;
    const animate = (time: number) => {
      frame = null;
      if (!canAnimate()) return;
      if (previousTime !== null) seconds += Math.min(80, Math.max(0, time - previousTime)) / 1000;
      previousTime = time;
      legendaryEffects?.frame(seconds, false);
      render();
      frame = requestAnimationFrame(animate);
    };
    const syncAnimation = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
      legendaryEffects?.frame(seconds, reducedMotion.matches);
      render();
      if (canAnimate()) frame = requestAnimationFrame(animate);
    };
    // Other avatars still render only on selection/resize. Only the visible legendary
    // preview has a loop, and it stops for background tabs and reduced motion.
    const visibilityObserver = legendaryEffects
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          syncAnimation();
        })
      : null;
    visibilityObserver?.observe(container);
    if (legendaryEffects) {
      document.addEventListener("visibilitychange", syncAnimation);
      window.addEventListener("focus", syncAnimation);
      window.addEventListener("blur", syncAnimation);
      reducedMotion.addEventListener("change", syncAnimation);
      legendaryEffects.frame(0, reducedMotion.matches);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      visibilityObserver?.disconnect();
      document.removeEventListener("visibilitychange", syncAnimation);
      window.removeEventListener("focus", syncAnimation);
      window.removeEventListener("blur", syncAnimation);
      reducedMotion.removeEventListener("change", syncAnimation);
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
