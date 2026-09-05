"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { buildHall, type Hall } from "./world/hall";
import { CameraRig, type FocusOffset } from "./world/camera";
import type { WorldSignals } from "./world/signals";

type WorldRenderer = THREE.WebGLRenderer | WebGPURenderer;
export type WorldBackend = "webgpu" | "webgl2" | "webgl";

interface ProtocolWorldProps {
  signals: WorldSignals;
  reducedMotion: boolean;
  focus: FocusOffset;
  onReady?: (backend: WorldBackend) => void;
}

/**
 * A procedural equirect environment: a ceiling light overhead, graphite all
 * around, and a very faint spectral band at the horizon so silver edges pick
 * up a hint of colour without any coloured light in the scene.
 */
function buildEnvironment(): THREE.DataTexture {
  const width = 128;
  const height = 64;
  const data = new Float32Array(width * height * 4);
  const color = new THREE.Color();
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const zenith = Math.pow(Math.max(0, 1 - v * 1.9), 3.2) * 1.7;
      const overhead = Math.exp(-Math.pow((u - 0.5) * 5, 2)) * zenith * 1.4;
      const horizon = Math.exp(-Math.pow((v - 0.52) * 9, 2));
      color.setHSL((u * 1.6) % 1, 0.55, 0.5);
      const r = 0.012 + zenith * 0.35 + overhead + horizon * (0.02 + color.r * 0.035);
      const g = 0.013 + zenith * 0.36 + overhead + horizon * (0.02 + color.g * 0.035);
      const b = 0.016 + zenith * 0.4 + overhead * 1.04 + horizon * (0.02 + color.b * 0.04);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 1;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function ProtocolWorld({ signals, reducedMotion, focus, onReady }: ProtocolWorldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const signalsRef = useRef(signals);
  const focusRef = useRef(focus);
  const reducedRef = useRef(reducedMotion);
  const readyRef = useRef(onReady);
  const [backend, setBackend] = useState<WorldBackend | null>(null);

  useEffect(() => { signalsRef.current = signals; }, [signals]);
  useEffect(() => { focusRef.current = focus; }, [focus]);
  useEffect(() => { reducedRef.current = reducedMotion; }, [reducedMotion]);
  useEffect(() => { readyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      const quality: "high" | "low" = window.innerWidth < 820 || (window.devicePixelRatio > 2.2 && window.innerWidth < 1200) ? "low" : "high";
      let renderer: WorldRenderer | undefined;
      let activeBackend: WorldBackend = "webgl";
      let webgpu: typeof import("three/webgpu") | undefined;
      let tsl: typeof import("three/tsl") | undefined;

      try {
        webgpu = await import("three/webgpu");
        tsl = await import("three/tsl");
        const hasWebGPU = "gpu" in navigator;
        const candidate = new webgpu.WebGPURenderer({ antialias: true, alpha: false, forceWebGL: !hasWebGPU });
        await candidate.init();
        renderer = candidate;
        const backendFlags = candidate.backend as { isWebGPUBackend?: boolean };
        activeBackend = hasWebGPU && backendFlags.isWebGPUBackend ? "webgpu" : "webgl2";
      } catch {
        renderer = undefined;
        webgpu = undefined;
        tsl = undefined;
      }
      if (!renderer) {
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
          activeBackend = "webgl";
        } catch {
          return;
        }
      }
      if (cancelled) {
        renderer.dispose();
        return;
      }

      host.dataset.renderer = activeBackend;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 1.5 : 1.2));
      renderer.setClearColor(0x000000, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = 0.98;
      renderer.domElement.className = "protocol-world-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.append(renderer.domElement);

      const resources: Array<{ dispose: () => void }> = [];
      const environment = buildEnvironment();
      resources.push(environment);

      /* Floor: a planar reflection through TSL on the node renderer, a
         polished physical material on the classic WebGL fallback. */
      let floorMaterial: THREE.Material;
      let reflectorTarget: THREE.Object3D | undefined;
      if (webgpu && tsl) {
        const reflection = tsl.reflector({ resolutionScale: quality === "high" ? 0.4 : 0.28, generateMipmaps: false });
        reflection.target.rotateX(-Math.PI / 2);
        reflectorTarget = reflection.target;
        const material = new webgpu.MeshPhysicalNodeMaterial({
          color: 0x07080a,
          metalness: 0.32,
          roughness: 0.5,
          clearcoat: 0.55,
          clearcoatRoughness: 0.3,
        });
        const view = tsl.normalize(tsl.cameraPosition.sub(tsl.positionWorld));
        const grazing = tsl.pow(tsl.oneMinus(tsl.saturate(view.y)), 1.6);
        const distanceFade = tsl.oneMinus(tsl.smoothstep(tsl.float(6), tsl.float(34), tsl.length(tsl.cameraPosition.sub(tsl.positionWorld))));
        material.emissiveNode = reflection.rgb.mul(tsl.mix(tsl.float(0.22), tsl.float(0.62), grazing)).mul(distanceFade);
        floorMaterial = material;
      } else {
        floorMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x07080a,
          metalness: 0.75,
          roughness: 0.28,
          clearcoat: 0.8,
          clearcoatRoughness: 0.2,
          envMapIntensity: 1.2,
        });
      }
      resources.push(floorMaterial);

      const hall: Hall = buildHall({ floorMaterial, quality });
      const { scene } = hall;
      scene.environment = environment;
      scene.environmentIntensity = 0.32;
      if (reflectorTarget) scene.add(reflectorTarget);

      const rig = new CameraRig(hall.stations, { after: 3, point: hall.gateCenter });
      const camera = rig.camera;
      const initialStage = signalsRef.current.stage;
      if (initialStage > 1 || reducedRef.current) rig.snapTo(initialStage);
      else rig.startApproach();

      /* Bloom on the node renderer so the light strips actually glow. */
      let postProcessing: InstanceType<typeof import("three/webgpu").PostProcessing> | undefined;
      if (webgpu && tsl && renderer instanceof webgpu.WebGPURenderer) {
        try {
          const { bloom } = await import("three/addons/tsl/display/BloomNode.js");
          const pipelines = webgpu as unknown as { RenderPipeline?: typeof webgpu.PostProcessing };
          postProcessing = new (pipelines.RenderPipeline ?? webgpu.PostProcessing)(renderer);
          const scenePass = tsl.pass(scene, camera);
          const sceneColor = scenePass.getTextureNode("output");
          const bloomPass = bloom(sceneColor, quality === "high" ? 0.3 : 0.22, 0.38, 1.0);
          postProcessing.outputNode = sceneColor.add(bloomPass);
        } catch {
          postProcessing = undefined;
        }
      }

      const pointer = new THREE.Vector2();
      let dragYaw = 0;
      let dragPitch = 0;
      let dragging = false;
      let pointerId = -1;
      let lastX = 0;
      let lastY = 0;
      let frame = 0;
      let visible = true;
      let disposed = false;
      let firstFrame = true;
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
        if (event.pointerType === "touch" && !dragging) return;
        pointer.set((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
        if (!dragging || event.pointerId !== pointerId) return;
        dragYaw = THREE.MathUtils.clamp(dragYaw + (event.clientX - lastX) * 0.0024, -0.9, 0.9);
        dragPitch = THREE.MathUtils.clamp(dragPitch - (event.clientY - lastY) * 0.0018, -0.36, 0.36);
        lastX = event.clientX;
        lastY = event.clientY;
      };
      const down = (event: PointerEvent) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
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
        const dt = timer.getDelta();
        const elapsed = timer.getElapsed();
        const reduced = reducedRef.current;
        const current = signalsRef.current;
        if (!dragging) {
          dragYaw *= reduced ? 0.6 : 0.965;
          dragPitch *= reduced ? 0.6 : 0.965;
          if (Math.abs(dragYaw) < 0.0004) dragYaw = 0;
          if (Math.abs(dragPitch) < 0.0004) dragPitch = 0;
        }
        rig.update({ dt, stage: current.stage, reducedMotion: reduced, pointer, dragYaw, dragPitch, focus: focusRef.current });
        hall.update({ dt, elapsed, signals: current, reducedMotion: reduced });
        if (postProcessing) postProcessing.render();
        else renderer!.render(scene, camera);
        if (firstFrame) {
          firstFrame = false;
          host.classList.add("is-live");
          setBackend(activeBackend);
          readyRef.current?.(activeBackend);
        }
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
      window.addEventListener("pointermove", move, { passive: true });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      document.addEventListener("visibilitychange", visibility);
      resize();
      frame = requestAnimationFrame(render);

      cleanup = () => {
        disposed = true;
        if (frame) cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        host.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        document.removeEventListener("visibilitychange", visibility);
        timer.dispose();
        postProcessing?.dispose();
        hall.dispose();
        resources.forEach((resource) => resource.dispose());
        renderer!.dispose();
        renderer!.domElement.remove();
        host.classList.remove("is-live");
      };
    };

    void start();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="protocol-world" ref={hostRef} aria-hidden="true" data-backend={backend ?? "pending"}>
      <div className="protocol-world-grade" />
    </div>
  );
}
