"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";

type OrbVariant = "marketplace" | "brand" | "stage";
type OrbRenderer = THREE.WebGLRenderer | WebGPURenderer;

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

export function MarketplaceOrb({ variant = "marketplace" }: { variant?: OrbVariant }) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let disposeScene: (() => void) | undefined;

    const start = async () => {
      let renderer: OrbRenderer | undefined;
      let backend: "webgpu" | "webgl" = "webgl";

      if ("gpu" in navigator) {
        try {
          const { WebGPURenderer } = await import("three/webgpu");
          const gpuRenderer = new WebGPURenderer({ alpha: true, antialias: true });
          await gpuRenderer.init();
          renderer = gpuRenderer;
          backend = "webgpu";
        } catch {
          renderer = undefined;
        }
      }

      if (!renderer) {
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: variant === "brand" ? "low-power" : "high-performance",
          });
        } catch {
          return;
        }
      }

      if (disposed) {
        renderer.dispose();
        return;
      }

      host.dataset.renderer = backend;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, variant === "brand" ? 1.5 : 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.className = "orb-canvas";
      host.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
      camera.position.z = variant === "brand" ? 4.1 : 4.4;

      const interactionRig = new THREE.Group();
      const model = new THREE.Group();
      interactionRig.add(model);
      scene.add(interactionRig);

      const resources: Array<{ dispose: () => void }> = [];
      const track = <T extends { dispose: () => void }>(resource: T): T => {
        resources.push(resource);
        return resource;
      };

      const coreGeometry = track(new THREE.IcosahedronGeometry(0.7, variant === "brand" ? 2 : 4));
      const coreMaterial = track(new THREE.MeshPhysicalMaterial({
        color: 0xeeeeee,
        emissive: 0x141414,
        metalness: 0.88,
        roughness: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      }));
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      model.add(core);

      const innerGeometry = track(new THREE.OctahedronGeometry(0.34, 1));
      const innerMaterial = track(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x454545,
        emissiveIntensity: 0.72,
        metalness: 1,
        roughness: 0.08,
      }));
      const inner = new THREE.Mesh(innerGeometry, innerMaterial);
      model.add(inner);

      const shellGeometry = track(new THREE.IcosahedronGeometry(1.02, variant === "brand" ? 2 : 3));
      const shellMaterial = track(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: variant === "brand" ? 0.42 : 0.28,
        wireframe: true,
        depthWrite: false,
      }));
      const shell = new THREE.Mesh(shellGeometry, shellMaterial);
      model.add(shell);

      const auraGeometry = track(new THREE.IcosahedronGeometry(1.11, 1));
      const auraMaterial = track(new THREE.MeshBasicMaterial({
        color: 0x777777,
        transparent: true,
        opacity: 0.075,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const aura = new THREE.Mesh(auraGeometry, auraMaterial);
      model.add(aura);

      const ringGeometry = track(new THREE.TorusGeometry(1.28, variant === "brand" ? 0.016 : 0.012, 6, 112));
      const ringMaterials = [0.34, 0.2, 0.12].map((opacity) => track(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })));
      const rings = [
        [0.72, 0.16, -0.28],
        [-0.9, 0.6, 0.18],
        [0.24, -0.88, 0.42],
      ].map(([x, y, z], index) => {
        const ring = new THREE.Mesh(ringGeometry, ringMaterials[index]);
        ring.rotation.set(x, y, z);
        model.add(ring);
        return ring;
      });

      const beadGeometry = track(new THREE.SphereGeometry(variant === "brand" ? 0.055 : 0.038, 8, 8));
      const beadMaterial = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const beads = new THREE.InstancedMesh(beadGeometry, beadMaterial, variant === "brand" ? 6 : 14);
      const beadMatrix = new THREE.Matrix4();
      const beadCount = beads.count;
      for (let index = 0; index < beadCount; index += 1) {
        const angle = (index / beadCount) * Math.PI * 2;
        const radius = 1.27 + Math.sin(index * 2.13) * 0.055;
        const point = new THREE.Vector3(
          Math.cos(angle) * radius,
          Math.sin(angle * 1.63) * 0.42,
          Math.sin(angle) * radius,
        );
        beadMatrix.makeTranslation(point.x, point.y, point.z);
        beads.setMatrixAt(index, beadMatrix);
      }
      model.add(beads);

      const random = seededRandom(4_021);
      const particleCount = variant === "brand" ? 44 : 150;
      const positions = new Float32Array(particleCount * 3);
      for (let index = 0; index < particleCount; index += 1) {
        const radius = 1.48 + random() * 0.72;
        const theta = random() * Math.PI * 2;
        const phi = Math.acos(2 * random() - 1);
        positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[index * 3 + 1] = radius * Math.cos(phi);
        positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      }
      const particleGeometry = track(new THREE.BufferGeometry());
      particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particleMaterial = track(new THREE.PointsMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: variant === "brand" ? 0.42 : 0.5,
        size: variant === "brand" ? 0.034 : 0.025,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      model.add(particles);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x050505, 1.8));
      const keyLight = new THREE.PointLight(0xffffff, 12, 8, 1.8);
      keyLight.position.set(2.4, 2.2, 3.2);
      scene.add(keyLight);
      const rimLight = new THREE.PointLight(0x8a8a8a, 8, 7, 2);
      rimLight.position.set(-2.4, -1.1, 1.4);
      scene.add(rimLight);

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timer = new THREE.Timer();
      timer.connect(document);
      let dragging = false;
      let pointerId = -1;
      let previousX = 0;
      let previousY = 0;
      let velocityX = 0;
      let velocityY = 0;
      let targetTiltX = -0.08;
      let targetTiltY = 0.14;
      let visible = true;
      let frame = 0;

      const renderOnce = () => renderer?.render(scene, camera);
      const resize = () => {
        const { width, height } = host.getBoundingClientRect();
        if (!renderer || width === 0 || height === 0) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderOnce();
      };

      const onPointerDown = (event: PointerEvent) => {
        dragging = true;
        pointerId = event.pointerId;
        previousX = event.clientX;
        previousY = event.clientY;
        velocityX = 0;
        velocityY = 0;
        host.classList.add("is-dragging");
        host.setPointerCapture?.(event.pointerId);
      };

      const onPointerMove = (event: PointerEvent) => {
        const bounds = host.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5;
        const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5;
        targetTiltY = x * 0.45;
        targetTiltX = y * 0.32;
        if (!dragging || event.pointerId !== pointerId) return;
        const dx = event.clientX - previousX;
        const dy = event.clientY - previousY;
        velocityY = dx * 0.012;
        velocityX = dy * 0.012;
        model.rotation.y += velocityY;
        model.rotation.x += velocityX;
        previousX = event.clientX;
        previousY = event.clientY;
      };

      const releasePointer = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        dragging = false;
        pointerId = -1;
        host.classList.remove("is-dragging");
        host.releasePointerCapture?.(event.pointerId);
      };

      const onPointerLeave = () => {
        if (dragging) return;
        targetTiltX = -0.08;
        targetTiltY = 0.14;
      };

      const animate = (timestamp?: number) => {
        frame = 0;
        if (!visible || document.hidden || disposed) return;
        timer.update(timestamp);
        const elapsed = timer.getElapsed();
        interactionRig.rotation.x += (targetTiltX - interactionRig.rotation.x) * 0.055;
        interactionRig.rotation.y += (targetTiltY - interactionRig.rotation.y) * 0.055;
        if (!prefersReducedMotion) {
          const baseSpeed = variant === "brand" ? 0.007 : 0.0032;
          if (!dragging) {
            model.rotation.y += baseSpeed + velocityY;
            model.rotation.x += velocityX;
            velocityX *= 0.94;
            velocityY *= 0.94;
          }
          core.rotation.y -= baseSpeed * 1.9;
          inner.rotation.x += baseSpeed * 2.6;
          inner.rotation.z -= baseSpeed * 1.7;
          shell.rotation.y += baseSpeed * 0.7;
          aura.rotation.z -= baseSpeed * 0.35;
          rings.forEach((ring, index) => { ring.rotation.z += baseSpeed * (0.18 + index * 0.13); });
          particles.rotation.y -= baseSpeed * 0.22;
          const pulse = 1 + Math.sin(elapsed * 1.8) * 0.035;
          inner.scale.setScalar(pulse);
        }
        renderOnce();
        frame = window.requestAnimationFrame(animate);
      };

      const wake = () => {
        if (!frame && visible && !document.hidden && !disposed) frame = window.requestAnimationFrame(animate);
      };

      const observer = new ResizeObserver(resize);
      const intersection = new IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible) wake();
        else if (frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      }, { rootMargin: "80px" });
      const onVisibility = () => wake();

      observer.observe(host);
      intersection.observe(host);
      host.addEventListener("pointerdown", onPointerDown);
      host.addEventListener("pointermove", onPointerMove);
      host.addEventListener("pointerup", releasePointer);
      host.addEventListener("pointercancel", releasePointer);
      host.addEventListener("pointerleave", onPointerLeave);
      document.addEventListener("visibilitychange", onVisibility);
      resize();
      wake();

      disposeScene = () => {
        if (frame) window.cancelAnimationFrame(frame);
        observer.disconnect();
        intersection.disconnect();
        host.removeEventListener("pointerdown", onPointerDown);
        host.removeEventListener("pointermove", onPointerMove);
        host.removeEventListener("pointerup", releasePointer);
        host.removeEventListener("pointercancel", releasePointer);
        host.removeEventListener("pointerleave", onPointerLeave);
        document.removeEventListener("visibilitychange", onVisibility);
        timer.dispose();
        resources.forEach((resource) => resource.dispose());
        renderer?.dispose();
        renderer?.domElement.remove();
        delete host.dataset.renderer;
      };
    };

    void start();
    return () => {
      disposed = true;
      disposeScene?.();
    };
  }, [variant]);

  return (
    <span className={`marketplace-orb ${variant}-orb`} ref={hostRef} aria-hidden="true">
      {variant === "marketplace" && <span className="orb-interaction-hint">DRAG TO ORBIT</span>}
    </span>
  );
}
