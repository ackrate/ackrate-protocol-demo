"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";

type WorldRenderer = THREE.WebGLRenderer | WebGPURenderer;

function randomFactory(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

export function ProtocolWorld({ step, reducedMotion }: { step: number; reducedMotion: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef(step);

  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      let renderer: WorldRenderer | undefined;
      let backend: "webgpu" | "webgl" = "webgl";
      if ("gpu" in navigator) {
        try {
          const { WebGPURenderer } = await import("three/webgpu");
          const candidate = new WebGPURenderer({ alpha: true, antialias: true });
          await candidate.init();
          renderer = candidate;
          backend = "webgpu";
        } catch {
          renderer = undefined;
        }
      }
      if (!renderer) {
        try {
          renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
        } catch {
          return;
        }
      }
      if (cancelled) {
        renderer.dispose();
        return;
      }

      host.dataset.renderer = backend;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.16;
      renderer.domElement.className = "protocol-world-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.append(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x020202, 0.052);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
      const cameraTarget = new THREE.Vector3();
      const cameraLook = new THREE.Vector3(1.8, 0, 0);
      camera.position.set(0.6, 0.2, 11.6);

      const resources: Array<{ dispose: () => void }> = [];
      const track = <T extends { dispose: () => void }>(value: T): T => {
        resources.push(value);
        return value;
      };

      const world = new THREE.Group();
      world.position.set(2.35, -0.02, 0);
      scene.add(world);

      const core = new THREE.Group();
      world.add(core);
      const blackCore = new THREE.Mesh(
        track(new THREE.IcosahedronGeometry(0.92, 6)),
        track(new THREE.MeshPhysicalMaterial({
          color: 0x050505,
          emissive: 0x151515,
          emissiveIntensity: 1.15,
          metalness: 0.96,
          roughness: 0.06,
          clearcoat: 1,
          clearcoatRoughness: 0.035,
        })),
      );
      core.add(blackCore);

      const energy = new THREE.Mesh(
        track(new THREE.TorusKnotGeometry(0.61, 0.095, 180, 18, 2, 3)),
        track(new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 2.6,
          metalness: 0.78,
          roughness: 0.08,
        })),
      );
      core.add(energy);

      const glass = new THREE.Mesh(
        track(new THREE.IcosahedronGeometry(1.15, 4)),
        track(new THREE.MeshPhysicalMaterial({
          color: 0xbfc9d8,
          transparent: true,
          opacity: 0.17,
          transmission: 0.56,
          thickness: 0.72,
          ior: 1.5,
          iridescence: 0.7,
          iridescenceIOR: 1.33,
          roughness: 0.05,
          metalness: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
        })),
      );
      core.add(glass);

      const cageSource = track(new THREE.IcosahedronGeometry(1.33, 2));
      const cage = new THREE.LineSegments(
        track(new THREE.EdgesGeometry(cageSource, 8)),
        track(new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.34,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })),
      );
      core.add(cage);

      const haloMaterial = track(new THREE.MeshBasicMaterial({
        color: 0xe9edf5,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const halos = [
        [1.82, 0.012, 0.4, 0.86, -0.2],
        [2.24, 0.008, -0.82, 0.18, 0.7],
        [2.74, 0.006, 1.04, -0.52, 0.22],
      ].map(([radius, tube, x, y, z]) => {
        const mesh = new THREE.Mesh(track(new THREE.TorusGeometry(radius, tube, 5, 220)), haloMaterial);
        mesh.rotation.set(x, y, z);
        core.add(mesh);
        return mesh;
      });

      const stationPoints = [
        new THREE.Vector3(-2.7, 1.95, -0.7),
        new THREE.Vector3(-0.95, 2.72, -1.35),
        new THREE.Vector3(1.35, 2.36, -0.9),
        new THREE.Vector3(2.9, 0.78, -0.35),
        new THREE.Vector3(2.28, -1.72, -0.75),
        new THREE.Vector3(-0.05, -2.72, -1.2),
      ];
      const orbitCurve = new THREE.CatmullRomCurve3([...stationPoints, stationPoints[0]!], true, "catmullrom", 0.28);
      const orbitTube = new THREE.Mesh(
        track(new THREE.TubeGeometry(orbitCurve, 420, 0.009, 5, true)),
        track(new THREE.MeshBasicMaterial({
          color: 0x8d98aa,
          transparent: true,
          opacity: 0.19,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })),
      );
      world.add(orbitTube);

      const stations = stationPoints.map((point, index) => {
        const station = new THREE.Group();
        station.position.copy(point);
        const ringMaterial = track(new THREE.MeshStandardMaterial({
          color: index === 0 ? 0xffffff : 0x484b52,
          emissive: index === 0 ? 0xffffff : 0x111111,
          emissiveIntensity: index === 0 ? 1.8 : 0.3,
          metalness: 0.95,
          roughness: 0.12,
        }));
        const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.22, 0.025, 8, 48)), ringMaterial);
        ring.rotation.set(Math.PI / 2.7, 0.18 * index, 0.22 * index);
        const spark = new THREE.Mesh(
          track(new THREE.OctahedronGeometry(0.055, 0)),
          track(new THREE.MeshBasicMaterial({ color: 0xffffff })),
        );
        station.add(ring, spark);
        world.add(station);
        return { group: station, ring, material: ringMaterial };
      });

      const packet = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.045, 10, 10)),
        track(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      );
      const packetLight = new THREE.PointLight(0xffffff, 3.5, 1.7, 2);
      packet.add(packetLight);
      world.add(packet);

      const random = randomFactory(40_206);
      const starCount = 1_150;
      const starPositions = new Float32Array(starCount * 3);
      const starSizes = new Float32Array(starCount);
      for (let index = 0; index < starCount; index += 1) {
        const radius = 6 + random() * 31;
        const theta = random() * Math.PI * 2;
        const phi = Math.acos(2 * random() - 1);
        starPositions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
        starPositions[index * 3 + 1] = Math.cos(phi) * radius * 0.62;
        starPositions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius - 7;
        starSizes[index] = 0.5 + random() * 1.5;
      }
      const starGeometry = track(new THREE.BufferGeometry());
      starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      starGeometry.setAttribute("size", new THREE.BufferAttribute(starSizes, 1));
      const stars = new THREE.Points(
        starGeometry,
        track(new THREE.PointsMaterial({
          color: 0xb9c2cf,
          size: 0.018,
          transparent: true,
          opacity: 0.62,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          sizeAttenuation: true,
        })),
      );
      scene.add(stars);

      const horizon = new THREE.GridHelper(44, 64, 0x24272c, 0x0b0c0e);
      horizon.position.set(2, -4.3, -4.2);
      horizon.rotation.x = 0.04;
      (horizon.material as THREE.Material).transparent = true;
      (horizon.material as THREE.Material).opacity = 0.34;
      scene.add(horizon);

      scene.add(new THREE.HemisphereLight(0xe7edf7, 0x030303, 0.7));
      const keyLight = new THREE.PointLight(0xffffff, 24, 11, 2);
      keyLight.position.set(3.4, 3.6, 5.8);
      scene.add(keyLight);
      const cursorLight = new THREE.PointLight(0x98b8ff, 11, 8, 2);
      cursorLight.position.set(1.5, 0, 4);
      scene.add(cursorLight);

      const pointer = new THREE.Vector2();
      const targetPointer = new THREE.Vector2();
      let dragging = false;
      let pointerId = -1;
      let lastX = 0;
      let lastY = 0;
      let dragX = 0;
      let dragY = 0;
      let velocityX = 0;
      let velocityY = 0;
      let frame = 0;
      let visible = true;
      let disposed = false;
      const clock = new THREE.Clock();

      const resize = () => {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        renderer!.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      const move = (event: PointerEvent) => {
        targetPointer.set((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
        if (!dragging || event.pointerId !== pointerId) return;
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        dragY += dx * 0.004;
        dragX += dy * 0.003;
        velocityY = dx * 0.0008;
        velocityX = dy * 0.0006;
        lastX = event.clientX;
        lastY = event.clientY;
      };
      const down = (event: PointerEvent) => {
        dragging = true;
        pointerId = event.pointerId;
        lastX = event.clientX;
        lastY = event.clientY;
        host.classList.add("is-dragging");
        host.setPointerCapture?.(event.pointerId);
      };
      const up = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        dragging = false;
        pointerId = -1;
        host.classList.remove("is-dragging");
        if (host.hasPointerCapture?.(event.pointerId)) host.releasePointerCapture(event.pointerId);
      };

      const cameraByStep = [
        new THREE.Vector3(0.25, 0.15, 11.8),
        new THREE.Vector3(0.55, 0.35, 11.15),
        new THREE.Vector3(0.8, -0.12, 10.65),
        new THREE.Vector3(0.35, 0.48, 10.25),
        new THREE.Vector3(0.68, -0.36, 9.85),
        new THREE.Vector3(0.1, 0, 9.25),
      ];

      const render = () => {
        frame = 0;
        if (!visible || document.hidden || disposed) return;
        const elapsed = clock.getElapsedTime();
        const active = Math.min(5, Math.max(0, stepRef.current - 1));
        pointer.lerp(targetPointer, 0.045);
        if (!dragging) {
          dragX *= 0.965;
          dragY += velocityY;
          dragX += velocityX;
          velocityX *= 0.93;
          velocityY *= 0.93;
        }

        world.rotation.x += ((pointer.y * 0.06 + dragX) - world.rotation.x) * 0.035;
        world.rotation.y += ((pointer.x * 0.08 + dragY + active * 0.045) - world.rotation.y) * 0.035;
        const destination = cameraByStep[active]!;
        cameraTarget.copy(destination);
        cameraTarget.x += pointer.x * 0.16;
        cameraTarget.y -= pointer.y * 0.11;
        camera.position.lerp(cameraTarget, 0.027);
        camera.lookAt(cameraLook);
        cursorLight.position.x += ((pointer.x * 3.2) + 2.1 - cursorLight.position.x) * 0.055;
        cursorLight.position.y += ((-pointer.y * 2.3) - cursorLight.position.y) * 0.055;

        if (!reducedMotion) {
          core.rotation.y += 0.0018;
          cage.rotation.x -= 0.0011;
          cage.rotation.y += 0.0017;
          energy.rotation.x += 0.0048;
          energy.rotation.z -= 0.0034;
          glass.rotation.y -= 0.0012;
          halos.forEach((halo, index) => { halo.rotation.z += 0.0007 + index * 0.00032; });
          stars.rotation.y = elapsed * -0.0035;
          horizon.position.z = -4.2 + Math.sin(elapsed * 0.2) * 0.1;
          packet.position.copy(orbitCurve.getPointAt((elapsed * 0.025 + active / 6) % 1));
        } else {
          packet.position.copy(stationPoints[active]!);
        }

        stations.forEach((station, index) => {
          const selected = index === active;
          station.material.color.setHex(selected ? 0xffffff : 0x484b52);
          station.material.emissive.setHex(selected ? 0xffffff : 0x111111);
          station.material.emissiveIntensity += ((selected ? 2.8 : 0.25) - station.material.emissiveIntensity) * 0.08;
          const targetScale = selected ? 1.72 + Math.sin(elapsed * 2.2) * 0.08 : 0.86;
          station.group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.075);
          if (!reducedMotion) station.ring.rotation.z += selected ? 0.011 : 0.002;
        });

        renderer!.render(scene, camera);
        frame = requestAnimationFrame(render);
      };

      const resizeObserver = new ResizeObserver(resize);
      const intersectionObserver = new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible && !frame) frame = requestAnimationFrame(render);
      });
      const visibility = () => {
        if (!document.hidden && visible && !frame) frame = requestAnimationFrame(render);
      };
      resizeObserver.observe(host);
      intersectionObserver.observe(host);
      host.addEventListener("pointerdown", down);
      host.addEventListener("pointermove", move);
      host.addEventListener("pointerup", up);
      host.addEventListener("pointercancel", up);
      document.addEventListener("visibilitychange", visibility);
      resize();
      frame = requestAnimationFrame(render);

      cleanup = () => {
        disposed = true;
        if (frame) cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        host.removeEventListener("pointerdown", down);
        host.removeEventListener("pointermove", move);
        host.removeEventListener("pointerup", up);
        host.removeEventListener("pointercancel", up);
        document.removeEventListener("visibilitychange", visibility);
        resources.forEach((resource) => resource.dispose());
        renderer!.dispose();
        renderer!.domElement.remove();
      };
    };

    void start();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [reducedMotion]);

  return <div className="protocol-world" ref={hostRef} aria-hidden="true">
    <div className="protocol-world-vignette" />
    <span className="world-renderer">{step.toString().padStart(2, "0")} / 06 · DRAG THE FIELD</span>
  </div>;
}
