"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";

type WorldRenderer = THREE.WebGLRenderer | WebGPURenderer;
type Gateway = {
  group: THREE.Group;
  core: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  signal: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  aura: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
};

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function canyonCenter(z: number): number {
  return 4.8 + Math.sin(z * 0.31) * 1.15 + Math.sin(z * 0.12) * 0.55;
}

function terrainHeight(x: number, z: number): number {
  const distanceFromRoute = Math.abs(x - canyonCenter(z));
  const wall = Math.pow(Math.max(0, distanceFromRoute - 2.15), 1.48) * 0.16;
  const broad = Math.sin(x * 0.42 + z * 0.17) * 0.22 + Math.cos(z * 0.37 - x * 0.12) * 0.18;
  const detail = Math.sin(x * 1.38 - z * 0.71) * 0.07 + Math.cos(x * 0.74 + z * 1.12) * 0.055;
  const routeBed = -Math.exp(-distanceFromRoute * distanceFromRoute * 0.48) * 0.28;
  return Math.min(4.8, wall + broad + detail + routeBed - 0.38);
}

function buildTerrain(): THREE.BufferGeometry {
  const xSegments = 124;
  const zSegments = 138;
  const xMin = -7;
  const xMax = 17;
  const zMin = -19;
  const zMax = 10;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  const random = seededRandom(913_402);

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const v = zIndex / zSegments;
    const z = THREE.MathUtils.lerp(zMin, zMax, v);
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const u = xIndex / xSegments;
      const x = THREE.MathUtils.lerp(xMin, xMax, u);
      const y = terrainHeight(x, z);
      positions.push(x, y, z);
      const ridge = THREE.MathUtils.clamp((y + 0.55) / 4.2, 0, 1);
      const shimmer = (random() - 0.5) * 0.018;
      color.setRGB(0.028 + ridge * 0.065 + shimmer, 0.032 + ridge * 0.072 + shimmer, 0.045 + ridge * 0.11 + shimmer);
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = xSegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = zIndex * row + xIndex;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.96;
      renderer.domElement.className = "protocol-world-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.append(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x03040a, 0.049);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(-0.35, 2.5, 11.3);

      const resources: Array<{ dispose: () => void }> = [];
      const track = <T extends { dispose: () => void }>(resource: T): T => {
        resources.push(resource);
        return resource;
      };

      const terrainMaterial = track(new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        metalness: 0.34,
        roughness: 0.58,
        clearcoat: 0.46,
        clearcoatRoughness: 0.36,
      }));
      const obsidian = track(new THREE.MeshPhysicalMaterial({
        color: 0x080a10,
        metalness: 0.88,
        roughness: 0.19,
        clearcoat: 0.9,
        clearcoatRoughness: 0.08,
      }));
      const silver = track(new THREE.MeshPhysicalMaterial({
        color: 0xaab4c7,
        emissive: 0x101728,
        emissiveIntensity: 0.38,
        metalness: 0.92,
        roughness: 0.13,
        clearcoat: 0.76,
      }));
      const pathMaterial = track(new THREE.MeshBasicMaterial({
        color: 0x8ba7ef,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const atmosphereMaterial = track(new THREE.MeshBasicMaterial({
        color: 0x7188c6,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));

      const world = new THREE.Group();
      scene.add(world);

      const terrain = new THREE.Mesh(track(buildTerrain()), terrainMaterial);
      world.add(terrain);

      const water = new THREE.Mesh(
        track(new THREE.PlaneGeometry(10, 34, 1, 1)),
        track(new THREE.MeshPhysicalMaterial({
          color: 0x050812,
          emissive: 0x091127,
          emissiveIntensity: 0.34,
          metalness: 0.72,
          roughness: 0.13,
          clearcoat: 1,
          transparent: true,
          opacity: 0.82,
          side: THREE.DoubleSide,
        })),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(4.8, -0.55, -4.5);
      world.add(water);

      const routeCoordinates = [
        [6.45, 3.35],
        [4.1, 0.15],
        [5.55, -3.2],
        [3.85, -6.35],
        [5.75, -9.55],
        [4.35, -13.0],
      ] as const;
      const gatewayPoints = routeCoordinates.map(([x, z]) => new THREE.Vector3(x, terrainHeight(x, z) + 0.92, z));
      const routePoints = [
        new THREE.Vector3(4.1, terrainHeight(4.1, 7.4) + 0.055, 7.4),
        ...gatewayPoints.map((point) => new THREE.Vector3(point.x, terrainHeight(point.x, point.z) + 0.065, point.z)),
        new THREE.Vector3(5.1, terrainHeight(5.1, -17) + 0.055, -17),
      ];
      const routeCurve = new THREE.CatmullRomCurve3(routePoints, false, "centripetal", 0.34);
      world.add(new THREE.Mesh(track(new THREE.TubeGeometry(routeCurve, 520, 0.023, 7, false)), pathMaterial));
      world.add(new THREE.Mesh(
        track(new THREE.TubeGeometry(routeCurve, 520, 0.19, 10, false)),
        track(new THREE.MeshPhysicalMaterial({
          color: 0x080b12,
          metalness: 0.86,
          roughness: 0.25,
          clearcoat: 0.7,
          transparent: true,
          opacity: 0.9,
        })),
      ));

      const markerGeometry = track(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8));
      const markers = new THREE.InstancedMesh(markerGeometry, pathMaterial, 78);
      const markerMatrix = new THREE.Object3D();
      for (let index = 0; index < 78; index += 1) {
        const point = routeCurve.getPointAt(index / 77);
        markerMatrix.position.copy(point);
        markerMatrix.position.y += 0.075;
        markerMatrix.rotation.z = Math.PI / 2;
        markerMatrix.updateMatrix();
        markers.setMatrixAt(index, markerMatrix.matrix);
      }
      markers.instanceMatrix.needsUpdate = true;
      world.add(markers);

      const gatewayBodyGeometry = track(new THREE.TorusGeometry(0.77, 0.09, 12, 96, Math.PI * 1.62));
      const gatewaySignalGeometry = track(new THREE.TorusGeometry(0.91, 0.022, 8, 96, Math.PI * 1.18));
      const gatewayCoreGeometry = track(new THREE.CircleGeometry(0.57, 64));
      const gatewayAuraGeometry = track(new THREE.RingGeometry(0.96, 0.99, 96));
      const plinthGeometry = track(new THREE.CylinderGeometry(0.78, 1.08, 0.13, 48));
      const pylonGeometry = track(new THREE.BoxGeometry(0.11, 0.78, 0.14, 2, 8, 2));
      const gateways: Gateway[] = gatewayPoints.map((point, index) => {
        const group = new THREE.Group();
        group.position.copy(point);
        const next = gatewayPoints[Math.min(index + 1, gatewayPoints.length - 1)]!;
        const previous = gatewayPoints[Math.max(0, index - 1)]!;
        group.rotation.y = Math.atan2(next.x - previous.x, next.z - previous.z) * 0.42;

        const plinth = new THREE.Mesh(plinthGeometry, obsidian);
        plinth.position.y = -0.88;
        const arch = new THREE.Mesh(gatewayBodyGeometry, obsidian);
        arch.rotation.z = Math.PI * 0.19;
        const signalMaterial = track(new THREE.MeshStandardMaterial({
          color: index === 0 ? 0xeaf0ff : 0x333b4d,
          emissive: index === 0 ? 0x728dde : 0x080b14,
          emissiveIntensity: index === 0 ? 1.8 : 0.16,
          metalness: 0.91,
          roughness: 0.12,
        }));
        const signal = new THREE.Mesh(gatewaySignalGeometry, signalMaterial);
        signal.rotation.z = Math.PI * 0.4;
        signal.position.z = 0.025;
        const coreMaterial = track(new THREE.MeshBasicMaterial({
          color: 0x9eb5ff,
          transparent: true,
          opacity: index === 0 ? 0.12 : 0.018,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        const core = new THREE.Mesh(gatewayCoreGeometry, coreMaterial);
        core.position.z = -0.035;
        const auraMaterial = track(new THREE.MeshBasicMaterial({
          color: 0xc6d3ff,
          transparent: true,
          opacity: index === 0 ? 0.24 : 0.018,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        const aura = new THREE.Mesh(gatewayAuraGeometry, auraMaterial);
        aura.position.z = -0.055;
        const leftPylon = new THREE.Mesh(pylonGeometry, silver);
        leftPylon.position.set(-0.72, -0.63, -0.02);
        leftPylon.rotation.z = -0.11;
        const rightPylon = new THREE.Mesh(pylonGeometry, silver);
        rightPylon.position.set(0.72, -0.63, -0.02);
        rightPylon.rotation.z = 0.11;
        const light = new THREE.PointLight(0x91aaff, index === 0 ? 5.5 : 0.15, 4.3, 2);
        light.position.set(0, 0.05, 0.6);
        group.add(plinth, arch, signal, core, aura, leftPylon, rightPylon, light);
        world.add(group);
        return { group, core, signal, aura, light };
      });

      // Monumental ribs turn the route into a place with scale and depth.
      const ribGeometry = track(new THREE.TorusGeometry(4.25, 0.055, 10, 120, Math.PI));
      [-1.8, -6.0, -10.4].forEach((z, index) => {
        const rib = new THREE.Mesh(ribGeometry, obsidian);
        rib.position.set(canyonCenter(z), terrainHeight(canyonCenter(z), z) - 0.28, z);
        rib.rotation.z = Math.PI;
        rib.rotation.y = (index - 1) * 0.12;
        rib.scale.set(1, 1.06 + index * 0.14, 1);
        world.add(rib);
        const innerRib = new THREE.Mesh(track(new THREE.TorusGeometry(4.06, 0.012, 6, 120, Math.PI)), atmosphereMaterial);
        innerRib.position.copy(rib.position);
        innerRib.rotation.copy(rib.rotation);
        innerRib.scale.copy(rib.scale);
        innerRib.position.z += 0.06;
        world.add(innerRib);
      });

      const beacon = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.055, 18, 14)),
        track(new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      beacon.add(new THREE.PointLight(0x9db4ff, 3.5, 2.4, 2));
      world.add(beacon);

      const random = seededRandom(804_020);
      const starPositions = new Float32Array(1_280 * 3);
      for (let index = 0; index < 1_280; index += 1) {
        starPositions[index * 3] = (random() - 0.5) * 46;
        starPositions[index * 3 + 1] = 2.5 + random() * 17;
        starPositions[index * 3 + 2] = 8 - random() * 55;
      }
      const starGeometry = track(new THREE.BufferGeometry());
      starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      world.add(new THREE.Points(starGeometry, track(new THREE.PointsMaterial({
        color: 0xa5b0c8,
        size: 0.022,
        transparent: true,
        opacity: 0.54,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }))));

      const mistPositions = new Float32Array(240 * 3);
      for (let index = 0; index < 240; index += 1) {
        mistPositions[index * 3] = canyonCenter(-15 + random() * 23) + (random() - 0.5) * 7;
        mistPositions[index * 3 + 1] = -0.15 + random() * 2.3;
        mistPositions[index * 3 + 2] = 7 - random() * 25;
      }
      const mistGeometry = track(new THREE.BufferGeometry());
      mistGeometry.setAttribute("position", new THREE.BufferAttribute(mistPositions, 3));
      world.add(new THREE.Points(mistGeometry, track(new THREE.PointsMaterial({
        color: 0x8ba6ea,
        size: 0.034,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }))));

      const horizonDisc = new THREE.Mesh(
        track(new THREE.CircleGeometry(4.2, 96)),
        track(new THREE.MeshBasicMaterial({
          color: 0x27345f,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })),
      );
      horizonDisc.position.set(10.8, 8.1, -27);
      world.add(horizonDisc);

      scene.add(new THREE.HemisphereLight(0x9caed2, 0x010103, 0.62));
      const moonLight = new THREE.DirectionalLight(0xd8e2ff, 2.8);
      moonLight.position.set(7, 11, 4);
      scene.add(moonLight);
      const valleyLight = new THREE.PointLight(0x627cc4, 22, 25, 2);
      valleyLight.position.set(5.8, 3.2, 1.8);
      scene.add(valleyLight);
      const cursorLight = new THREE.PointLight(0xd8e3ff, 8, 9, 2);
      cursorLight.position.set(3, 2, 5);
      scene.add(cursorLight);

      const cameraPositions = [
        new THREE.Vector3(-0.35, 2.5, 11.3),
        new THREE.Vector3(0.3, 2.25, 8.35),
        new THREE.Vector3(0.8, 2.0, 5.0),
        new THREE.Vector3(0.25, 1.9, 1.85),
        new THREE.Vector3(0.95, 1.75, -1.45),
        new THREE.Vector3(0.4, 1.65, -4.75),
      ];
      const lookTargets = gatewayPoints.map((point) => new THREE.Vector3(point.x, point.y - 0.04, point.z));
      const cameraGoal = camera.position.clone();
      const lookCurrent = lookTargets[0]!.clone();
      const lookGoal = lookCurrent.clone();
      const pointer = new THREE.Vector2();
      const pointerGoal = new THREE.Vector2();
      let dragYaw = 0;
      let dragPitch = 0;
      let dragging = false;
      let pointerId = -1;
      let lastX = 0;
      let lastY = 0;
      let frame = 0;
      let visible = true;
      let disposed = false;
      const timer = new THREE.Timer();
      timer.connect(document);

      const resize = () => {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        renderer!.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const move = (event: PointerEvent) => {
        pointerGoal.set((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
        if (!dragging || event.pointerId !== pointerId) return;
        dragYaw = THREE.MathUtils.clamp(dragYaw + (event.clientX - lastX) * 0.0022, -0.8, 0.8);
        dragPitch = THREE.MathUtils.clamp(dragPitch - (event.clientY - lastY) * 0.0016, -0.32, 0.32);
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

      const render = () => {
        frame = 0;
        if (!visible || document.hidden || disposed) return;
        timer.update();
        const elapsed = timer.getElapsed();
        const active = Math.min(5, Math.max(0, stepRef.current - 1));
        pointer.lerp(pointerGoal, 0.042);
        if (!dragging) {
          dragYaw *= 0.972;
          dragPitch *= 0.972;
        }

        cameraGoal.copy(cameraPositions[active]!);
        cameraGoal.x += pointer.x * 0.18;
        cameraGoal.y -= pointer.y * 0.11;
        camera.position.lerp(cameraGoal, reducedMotion ? 0.18 : 0.026);
        lookGoal.copy(lookTargets[active]!);
        lookGoal.x += pointer.x * 0.25 + dragYaw;
        lookGoal.y -= pointer.y * 0.16 - dragPitch;
        lookCurrent.lerp(lookGoal, reducedMotion ? 0.2 : 0.034);
        camera.lookAt(lookCurrent);
        cursorLight.position.x += ((pointer.x * 4) + 4.8 - cursorLight.position.x) * 0.04;
        cursorLight.position.y += ((-pointer.y * 2.2) + 1.8 - cursorLight.position.y) * 0.04;

        gateways.forEach((gateway, index) => {
          const selected = index === active;
          gateway.signal.material.color.setHex(selected ? 0xeaf0ff : 0x333b4d);
          gateway.signal.material.emissive.setHex(selected ? 0x728dde : 0x080b14);
          gateway.signal.material.emissiveIntensity += ((selected ? 1.9 : 0.16) - gateway.signal.material.emissiveIntensity) * 0.07;
          gateway.core.material.opacity += ((selected ? 0.12 : 0.018) - gateway.core.material.opacity) * 0.07;
          gateway.aura.material.opacity += ((selected ? 0.19 : 0.012) - gateway.aura.material.opacity) * 0.07;
          gateway.light.intensity += ((selected ? 5.5 : 0.15) - gateway.light.intensity) * 0.07;
          const pulse = selected && !reducedMotion ? 1 + Math.sin(elapsed * 1.4) * 0.035 : 1;
          gateway.aura.scale.setScalar(pulse);
        });

        if (active >= 4 && !reducedMotion) {
          beacon.position.copy(routeCurve.getPointAt((elapsed * 0.075) % 1));
          beacon.visible = true;
        } else {
          beacon.position.copy(routeCurve.getPointAt((active + 0.8) / 7));
          beacon.visible = active > 0;
        }

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
        timer.dispose();
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
    <span className="world-renderer">{step.toString().padStart(2, "0")} / 06 · DRAG TO LOOK</span>
  </div>;
}
