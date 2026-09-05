"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";

type WorldRenderer = THREE.WebGLRenderer | WebGPURenderer;
type Dock = {
  group: THREE.Group;
  iris: THREE.Group;
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  material: THREE.MeshStandardMaterial;
};

function randomFactory(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function createBladeGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.42, -0.1);
  shape.bezierCurveTo(0.76, -0.3, 1.42, -0.28, 1.74, -0.02);
  shape.bezierCurveTo(1.42, 0.1, 0.87, 0.3, 0.47, 0.13);
  shape.quadraticCurveTo(0.37, 0.02, 0.42, -0.1);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 18,
  });
  geometry.translate(0, 0, -0.0375);
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.92;
      renderer.domElement.className = "protocol-world-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.append(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x010103, 0.047);
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
      const cameraTarget = new THREE.Vector3();
      const cameraLook = new THREE.Vector3(2.05, -0.06, -0.35);
      camera.position.set(0.15, 0.08, 12.6);

      const resources: Array<{ dispose: () => void }> = [];
      const track = <T extends { dispose: () => void }>(value: T): T => {
        resources.push(value);
        return value;
      };

      const graphite = track(new THREE.MeshPhysicalMaterial({
        color: 0x101116,
        metalness: 0.94,
        roughness: 0.17,
        clearcoat: 0.78,
        clearcoatRoughness: 0.1,
      }));
      const blackChrome = track(new THREE.MeshPhysicalMaterial({
        color: 0x030407,
        metalness: 1,
        roughness: 0.07,
        clearcoat: 1,
        clearcoatRoughness: 0.025,
      }));
      const paleMetal = track(new THREE.MeshPhysicalMaterial({
        color: 0xb8c1d2,
        emissive: 0x1b2231,
        emissiveIntensity: 0.3,
        metalness: 0.92,
        roughness: 0.12,
        clearcoat: 0.8,
      }));
      const spectralGlass = track(new THREE.MeshPhysicalMaterial({
        color: 0xaabfff,
        emissive: 0x273a73,
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.66,
        transmission: 0.46,
        thickness: 1.7,
        ior: 1.54,
        iridescence: 0.82,
        iridescenceIOR: 1.37,
        roughness: 0.035,
        metalness: 0.08,
        depthWrite: false,
      }));
      const ghostLine = track(new THREE.MeshBasicMaterial({
        color: 0x77859e,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const coldLight = track(new THREE.MeshBasicMaterial({
        color: 0xeaf0ff,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));

      const world = new THREE.Group();
      world.position.set(2.4, -0.05, -0.4);
      world.rotation.set(-0.06, -0.08, 0);
      scene.add(world);

      // One machine, six destinations: an on-chain payment observatory.
      const observatory = new THREE.Group();
      observatory.rotation.set(0.12, -0.12, 0.05);
      world.add(observatory);

      const iris = new THREE.Group();
      observatory.add(iris);
      const bladeGeometry = track(createBladeGeometry());
      const bladeEdgeGeometry = track(new THREE.EdgesGeometry(bladeGeometry, 34));
      const bladeEdgeMaterial = track(new THREE.LineBasicMaterial({
        color: 0xaab4c6,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
      }));
      const blades: THREE.Mesh[] = [];
      for (let index = 0; index < 12; index += 1) {
        const pivot = new THREE.Group();
        pivot.rotation.z = (index / 12) * Math.PI * 2;
        const blade = new THREE.Mesh(bladeGeometry, index % 3 === 0 ? paleMetal : graphite);
        blade.rotation.z = 0.08;
        blade.rotation.x = index % 2 === 0 ? 0.025 : -0.025;
        blade.add(new THREE.LineSegments(bladeEdgeGeometry, bladeEdgeMaterial));
        pivot.add(blade);
        iris.add(pivot);
        blades.push(blade);
      }

      const aperture = new THREE.Group();
      aperture.position.z = 0.22;
      observatory.add(aperture);
      const apertureBack = new THREE.Mesh(track(new THREE.CylinderGeometry(0.69, 0.82, 0.22, 96)), blackChrome);
      apertureBack.rotation.x = Math.PI / 2;
      aperture.add(apertureBack);
      const apertureRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.66, 0.055, 16, 128)), paleMetal);
      aperture.add(apertureRing);
      const pearl = new THREE.Mesh(track(new THREE.SphereGeometry(0.48, 72, 54)), spectralGlass);
      pearl.position.z = 0.18;
      aperture.add(pearl);
      const pearlHalo = new THREE.Mesh(track(new THREE.TorusGeometry(0.53, 0.011, 6, 96)), coldLight);
      pearlHalo.position.z = 0.22;
      aperture.add(pearlHalo);

      const rail = new THREE.Group();
      rail.position.z = -0.06;
      observatory.add(rail);
      rail.add(new THREE.Mesh(track(new THREE.TorusGeometry(2.22, 0.025, 10, 256)), graphite));
      rail.add(new THREE.Mesh(track(new THREE.TorusGeometry(1.93, 0.009, 6, 220)), ghostLine));
      const arcGeometry = track(new THREE.TorusGeometry(2.48, 0.038, 9, 72, 0.72));
      for (let index = 0; index < 6; index += 1) {
        const arc = new THREE.Mesh(arcGeometry, index === 0 ? paleMetal : graphite);
        arc.rotation.z = (index / 6) * Math.PI * 2 + 0.15;
        rail.add(arc);
      }

      const tickGeometry = track(new THREE.BoxGeometry(0.025, 0.1, 0.045));
      const ticks = new THREE.InstancedMesh(tickGeometry, paleMetal, 96);
      const tickMatrix = new THREE.Object3D();
      for (let index = 0; index < 96; index += 1) {
        const angle = (index / 96) * Math.PI * 2;
        const radius = index % 4 === 0 ? 2.7 : 2.64;
        tickMatrix.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -0.03);
        tickMatrix.rotation.z = angle;
        tickMatrix.scale.set(1, index % 4 === 0 ? 1.8 : 0.72, 1);
        tickMatrix.updateMatrix();
        ticks.setMatrixAt(index, tickMatrix.matrix);
      }
      ticks.instanceMatrix.needsUpdate = true;
      observatory.add(ticks);

      const dockPoints = Array.from({ length: 6 }, (_, index) => {
        const angle = Math.PI * 0.18 - (index / 6) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * 3.15, Math.sin(angle) * 3.15, -0.08 - (index % 2) * 0.12);
      });
      const routeCurve = new THREE.CatmullRomCurve3(dockPoints, true, "centripetal", 0.25);
      observatory.add(new THREE.Mesh(track(new THREE.TubeGeometry(routeCurve, 540, 0.009, 5, true)), ghostLine));

      const dockBodyGeometry = track(new THREE.CylinderGeometry(0.12, 0.17, 0.12, 32));
      const dockRingGeometry = track(new THREE.TorusGeometry(0.31, 0.02, 8, 72));
      const dockArcGeometry = track(new THREE.TorusGeometry(0.46, 0.026, 8, 48, 4.45));
      const dockRailGeometry = track(new THREE.BoxGeometry(0.032, 0.2, 0.04));
      const pulseGeometry = track(new THREE.RingGeometry(0.35, 0.37, 64));
      const docks: Dock[] = dockPoints.map((point, index) => {
        const group = new THREE.Group();
        group.position.copy(point);
        group.rotation.z = -Math.PI * 0.18 + (index / 6) * Math.PI * 2;
        const material = track(new THREE.MeshStandardMaterial({
          color: index === 0 ? 0xeaf0ff : 0x323743,
          emissive: index === 0 ? 0x718bd6 : 0x090b10,
          emissiveIntensity: index === 0 ? 1.15 : 0.16,
          metalness: 0.92,
          roughness: 0.14,
        }));
        const body = new THREE.Mesh(dockBodyGeometry, blackChrome);
        body.rotation.x = Math.PI / 2;
        const dockIris = new THREE.Group();
        const ring = new THREE.Mesh(dockRingGeometry, material);
        const arc = new THREE.Mesh(dockArcGeometry, material);
        arc.rotation.z = 0.92;
        const railLeft = new THREE.Mesh(dockRailGeometry, material);
        railLeft.position.set(-0.43, 0.03, 0);
        const railRight = new THREE.Mesh(dockRailGeometry, material);
        railRight.position.set(0.43, -0.03, 0);
        const pulseMaterial = track(coldLight.clone());
        const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
        pulse.position.z = -0.035;
        const light = new THREE.PointLight(0xa9bdff, index === 0 ? 5 : 0, 2.8, 2);
        light.position.z = 0.55;
        dockIris.add(ring, arc, railLeft, railRight);
        group.add(body, dockIris, pulse, light);
        observatory.add(group);
        return { group, iris: dockIris, pulse, light, material };
      });

      const packetGeometry = track(new THREE.SphereGeometry(0.046, 18, 14));
      const packets = [0, 0.33, 0.66].map((offset) => {
        const packet = new THREE.Mesh(packetGeometry, coldLight);
        packet.add(new THREE.PointLight(0xb8c8ff, 2.2, 1.5, 2));
        observatory.add(packet);
        return { mesh: packet, offset };
      });

      // The machine sits over a shallow spatial deck rather than inside a UI card.
      const floor = new THREE.Group();
      floor.position.set(0.2, -2.65, -1.35);
      floor.rotation.x = Math.PI / 2.55;
      world.add(floor);
      floor.add(new THREE.Mesh(
        track(new THREE.RingGeometry(1.1, 4.7, 160, 4)),
        track(new THREE.MeshBasicMaterial({ color: 0x111522, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })),
      ));
      [1.35, 2.45, 3.65, 4.62].forEach((radius, index) => {
        floor.add(new THREE.Mesh(track(new THREE.TorusGeometry(radius, index === 3 ? 0.018 : 0.008, 5, 180)), ghostLine));
      });
      const floorStrutGeometry = track(new THREE.BoxGeometry(3.35, 0.008, 0.008));
      for (let index = 0; index < 12; index += 1) {
        const strut = new THREE.Mesh(floorStrutGeometry, ghostLine);
        strut.position.x = 2.05;
        strut.rotation.z = (index / 12) * Math.PI * 2;
        floor.add(strut);
      }

      const archGroup = new THREE.Group();
      archGroup.position.set(0.15, 0, -1.2);
      world.add(archGroup);
      [3.75, 4.35, 5.1].forEach((radius, index) => {
        const arch = new THREE.Mesh(
          track(new THREE.TorusGeometry(radius, 0.012 - index * 0.002, 6, 180, Math.PI * (1.07 + index * 0.08))),
          ghostLine,
        );
        arch.rotation.set(0.18 + index * 0.17, -0.32 + index * 0.21, 0.72 + index * 0.46);
        archGroup.add(arch);
      });

      const random = randomFactory(40_206);
      const starPositions = new Float32Array(1_650 * 3);
      for (let index = 0; index < 1_650; index += 1) {
        const radius = 5 + random() * 34;
        const theta = random() * Math.PI * 2;
        const phi = Math.acos(2 * random() - 1);
        starPositions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
        starPositions[index * 3 + 1] = Math.cos(phi) * radius * 0.62;
        starPositions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius - 7;
      }
      const starGeometry = track(new THREE.BufferGeometry());
      starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      const stars = new THREE.Points(starGeometry, track(new THREE.PointsMaterial({
        color: 0x9daac0,
        size: 0.014,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })));
      scene.add(stars);

      const hazePositions = new Float32Array(180 * 3);
      for (let index = 0; index < 180; index += 1) {
        hazePositions[index * 3] = (random() - 0.22) * 13;
        hazePositions[index * 3 + 1] = (random() - 0.5) * 8;
        hazePositions[index * 3 + 2] = random() * 8 - 1;
      }
      const hazeGeometry = track(new THREE.BufferGeometry());
      hazeGeometry.setAttribute("position", new THREE.BufferAttribute(hazePositions, 3));
      const haze = new THREE.Points(hazeGeometry, track(new THREE.PointsMaterial({
        color: 0xdce5ff,
        size: 0.025,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })));
      scene.add(haze);

      scene.add(new THREE.HemisphereLight(0xb9c7e0, 0x010103, 0.58));
      const keyLight = new THREE.SpotLight(0xe9efff, 32, 18, Math.PI / 5.2, 0.7, 1.6);
      keyLight.position.set(3.8, 5.2, 7.5);
      keyLight.target.position.set(2.3, 0, -0.5);
      scene.add(keyLight, keyLight.target);
      const rimLight = new THREE.PointLight(0x7186cf, 15, 10, 2);
      rimLight.position.set(5.6, -2.8, 2.6);
      scene.add(rimLight);
      const cursorLight = new THREE.PointLight(0xc4d2ff, 10, 8, 2);
      cursorLight.position.set(1.5, 0, 4);
      scene.add(cursorLight);

      const pointer = new THREE.Vector2();
      const targetPointer = new THREE.Vector2();
      const stationScale = new THREE.Vector3();
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
        targetPointer.set((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
        if (!dragging || event.pointerId !== pointerId) return;
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        dragY += dx * 0.0032;
        dragX += dy * 0.0025;
        velocityY = dx * 0.00065;
        velocityX = dy * 0.0005;
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
        new THREE.Vector3(0.15, 0.08, 12.6),
        new THREE.Vector3(0.38, 0.22, 12.05),
        new THREE.Vector3(0.72, -0.05, 11.52),
        new THREE.Vector3(0.42, 0.32, 11.08),
        new THREE.Vector3(0.76, -0.24, 10.55),
        new THREE.Vector3(0.28, 0.02, 10.1),
      ];

      const render = () => {
        frame = 0;
        if (!visible || document.hidden || disposed) return;
        timer.update();
        const elapsed = timer.getElapsed();
        const active = Math.min(5, Math.max(0, stepRef.current - 1));
        pointer.lerp(targetPointer, 0.045);
        if (!dragging) {
          dragX *= 0.965;
          dragY += velocityY;
          dragX += velocityX;
          velocityX *= 0.925;
          velocityY *= 0.925;
        }

        world.rotation.x += ((pointer.y * 0.055 + dragX - 0.06) - world.rotation.x) * 0.032;
        world.rotation.y += ((pointer.x * 0.075 + dragY - 0.08) - world.rotation.y) * 0.032;
        observatory.rotation.z += ((active * Math.PI / 3 * 0.12 + 0.05) - observatory.rotation.z) * 0.018;
        const destination = cameraByStep[active]!;
        cameraTarget.copy(destination);
        cameraTarget.x += pointer.x * 0.14;
        cameraTarget.y -= pointer.y * 0.1;
        camera.position.lerp(cameraTarget, 0.025);
        camera.lookAt(cameraLook);
        cursorLight.position.x += ((pointer.x * 3.1) + 2.2 - cursorLight.position.x) * 0.05;
        cursorLight.position.y += ((-pointer.y * 2.2) - cursorLight.position.y) * 0.05;

        const open = reducedMotion ? 0.04 : 0.045 + Math.sin(elapsed * 0.58) * 0.018 + active * 0.006;
        blades.forEach((blade, index) => {
          const angle = (index / 12) * Math.PI * 2;
          blade.position.set(Math.cos(angle) * open, Math.sin(angle) * open, 0);
          blade.rotation.z = 0.08 + open * 0.72;
        });

        if (!reducedMotion) {
          iris.rotation.z = elapsed * 0.035;
          rail.rotation.z = -elapsed * 0.012;
          aperture.rotation.z = elapsed * -0.055;
          pearl.rotation.y = elapsed * 0.18;
          pearl.rotation.x = elapsed * 0.09;
          pearlHalo.scale.setScalar(1 + Math.sin(elapsed * 1.4) * 0.025);
          archGroup.rotation.z = Math.sin(elapsed * 0.13) * 0.035;
          floor.rotation.z = elapsed * 0.004;
          stars.rotation.y = elapsed * -0.0026;
          haze.rotation.y = elapsed * 0.005;
          packets.forEach(({ mesh, offset }, index) => {
            mesh.position.copy(routeCurve.getPointAt((elapsed * (0.018 + index * 0.002) + offset + active / 6) % 1));
          });
        } else {
          packets.forEach(({ mesh }, index) => mesh.position.copy(dockPoints[(active + index) % 6]!));
        }

        docks.forEach((dock, index) => {
          const selected = index === active;
          dock.material.color.setHex(selected ? 0xeaf0ff : 0x323743);
          dock.material.emissive.setHex(selected ? 0x718bd6 : 0x090b10);
          dock.material.emissiveIntensity += ((selected ? 1.5 : 0.16) - dock.material.emissiveIntensity) * 0.075;
          dock.light.intensity += ((selected ? 6.5 : 0) - dock.light.intensity) * 0.07;
          const targetScale = selected ? 1.27 + Math.sin(elapsed * 1.9) * 0.025 : 0.84;
          stationScale.setScalar(targetScale);
          dock.group.scale.lerp(stationScale, 0.07);
          dock.pulse.material.opacity = selected ? 0.26 + Math.sin(elapsed * 2) * 0.1 : 0.025;
          dock.pulse.scale.setScalar(selected ? 1.1 + (Math.sin(elapsed * 1.2) + 1) * 0.18 : 0.86);
          if (!reducedMotion) dock.iris.rotation.z += selected ? 0.007 : 0.0012;
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
    <span className="world-renderer">{step.toString().padStart(2, "0")} / 06 · DRAG THE FIELD</span>
  </div>;
}
