"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function SecurityProofField() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) return;

    let cancelled = false;
    let renderer: import("three/webgpu").WebGPURenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let timer: THREE.Timer | null = null;

    async function mount(host: HTMLDivElement) {
      try {
        const { WebGPURenderer } = await import("three/webgpu");
        if (cancelled) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 7.2);

        const field = new THREE.Group();
        scene.add(field);

        const core = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.35, 2),
          new THREE.MeshBasicMaterial({ color: 0x34d399, wireframe: true, transparent: true, opacity: 0.32 }),
        );
        field.add(core);

        const shell = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.15, 1)),
          new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.16 }),
        );
        field.add(shell);

        const nodeGeometry = new THREE.SphereGeometry(0.075, 16, 16);
        const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x6ee7b7 });
        const nodes: THREE.Mesh[] = [];
        for (let index = 0; index < 6; index += 1) {
          const angle = (index / 6) * Math.PI * 2;
          const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
          node.position.set(Math.cos(angle) * 2.45, Math.sin(angle) * 1.35, Math.sin(angle * 2) * 0.55);
          nodes.push(node);
          field.add(node);
        }

        const positions: number[] = [];
        nodes.forEach((node) => positions.push(0, 0, 0, node.position.x, node.position.y, node.position.z));
        const linksGeometry = new THREE.BufferGeometry();
        linksGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        field.add(new THREE.LineSegments(
          linksGeometry,
          new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.24 }),
        ));

        renderer = new WebGPURenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        await renderer.init();
        if (cancelled || !renderer) {
          renderer?.dispose();
          return;
        }

        renderer.domElement.className = "h-full w-full";
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.appendChild(renderer.domElement);

        const resize = () => {
          if (!renderer) return;
          const width = Math.max(host.clientWidth, 1);
          const height = Math.max(host.clientHeight, 1);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resize();

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reducedMotion) {
          renderer.render(scene, camera);
          return;
        }

        timer = new THREE.Timer();
        timer.connect(document);
        renderer.setAnimationLoop(() => {
          timer?.update();
          const elapsed = timer?.getElapsed() ?? 0;
          field.rotation.y = elapsed * 0.13;
          field.rotation.x = Math.sin(elapsed * 0.32) * 0.12;
          core.rotation.z = elapsed * -0.08;
          nodes.forEach((node, index) => {
            node.scale.setScalar(0.88 + Math.sin(elapsed * 1.8 + index) * 0.18);
          });
          renderer?.render(scene, camera);
        });
      } catch {
        // The CSS visualization remains intact when WebGPU/WebGL2 is unavailable.
      }
    }

    void mount(hostElement);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      timer?.dispose();
      renderer?.setAnimationLoop(null);
      renderer?.dispose();
      hostElement.replaceChildren();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden />;
}
