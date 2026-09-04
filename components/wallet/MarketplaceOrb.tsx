"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function MarketplaceOrb({ variant = "marketplace" }: { variant?: "marketplace" | "brand" | "stage" }) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.z = 4.6;

    const group = new THREE.Group();
    scene.add(group);

    const globeGeometry = new THREE.IcosahedronGeometry(1.04, 3);
    const globeMaterial = new THREE.MeshBasicMaterial({
      color: 0x8a8a8a,
      transparent: true,
      opacity: 0.22,
      wireframe: true,
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    group.add(globe);

    const nodeMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      size: 0.026,
      sizeAttenuation: true,
    });
    const nodes = new THREE.Points(globeGeometry, nodeMaterial);
    group.add(nodes);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
    const rings = [0, Math.PI / 3, -Math.PI / 3].map((rotation) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.008, 5, 96), ringMaterial);
      ring.rotation.x = rotation;
      ring.rotation.y = rotation / 2;
      group.add(ring);
      return ring;
    });

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rotationSpeed = variant === "brand" ? 0.009 : variant === "stage" ? 0.005 : 0.0025;
    let targetX = -0.12;
    let targetY = 0.18;
    let frame = 0;

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      targetY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.75;
      targetX = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.5;
    };

    const onPointerLeave = () => {
      targetX = -0.12;
      targetY = 0.18;
    };

    const render = () => {
      group.rotation.x += (targetX - group.rotation.x) * 0.045;
      group.rotation.y += (targetY - group.rotation.y) * 0.045;
      if (!prefersReducedMotion) {
        globe.rotation.y += rotationSpeed;
        nodes.rotation.y -= rotationSpeed * 0.72;
        rings.forEach((ring, index) => { ring.rotation.z += rotationSpeed * 0.36 * (index + 1); });
      }
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);
    resize();
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      globeGeometry.dispose();
      globeMaterial.dispose();
      nodeMaterial.dispose();
      rings.forEach((ring) => ring.geometry.dispose());
      ringMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [variant]);

  return <span className={`marketplace-orb ${variant}-orb`} ref={hostRef} aria-hidden="true" />;
}
