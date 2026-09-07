"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface AckrateSolarMarkProps {
  className?: string;
  size?: number;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying float vHeat;
  varying vec3 vNormalView;
  varying vec3 vPosition;

  void main() {
    float waveA = sin(position.x * 9.0 + uTime * 4.8);
    float waveB = sin(position.y * 13.0 - uTime * 6.2);
    float waveC = sin(position.z * 11.0 + uTime * 3.6);
    float heat = (waveA + waveB + waveC) / 3.0;
    vec3 displaced = position + normal * heat * 0.045;
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    vHeat = heat;
    vPosition = displaced;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  varying float vHeat;
  varying vec3 vNormalView;
  varying vec3 vPosition;

  void main() {
    float bands = sin((vPosition.x - vPosition.y + vPosition.z) * 18.0 - uTime * 7.0) * 0.5 + 0.5;
    float fresnel = pow(1.0 - abs(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0))), 2.1);
    float fire = clamp(vHeat * 0.48 + bands * 0.44 + 0.44, 0.0, 1.0);
    vec3 deepRed = vec3(0.34, 0.0, 0.0);
    vec3 solarRed = vec3(1.0, 0.025, 0.0);
    vec3 whiteHot = vec3(1.0, 0.62, 0.28);
    vec3 color = mix(deepRed, solarRed, fire);
    color = mix(color, whiteHot, pow(fire, 4.0) * 0.7);
    color += vec3(0.42, 0.0, 0.0) * fresnel;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const coronaVertex = /* glsl */ `
  varying vec3 vNormalView;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coronaFragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormalView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormalView, vec3(0.0, 0.0, 1.0))), 2.8);
    float pulse = 0.72 + sin(uTime * 5.5) * 0.12;
    gl_FragColor = vec4(1.0, 0.015, 0.0, rim * pulse * 0.72);
  }
`;

function seeded(index: number) {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function AckrateSolarMark({ className = "", size = 42 }: AckrateSolarMarkProps) {
  const mountRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      mount.dataset.fallback = "true";
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    camera.position.z = 5.6;

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size, false);
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    group.rotation.x = -0.22;
    scene.add(group);

    const coreGeometry = new THREE.IcosahedronGeometry(0.76, 5);
    const coreMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    const coronaGeometry = new THREE.IcosahedronGeometry(0.94, 4);
    const coronaMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: coronaVertex,
      fragmentShader: coronaFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
    group.add(corona);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff1300,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.018, 8, 96), ringMaterial);
    ringA.rotation.set(1.08, 0.18, -0.26);
    group.add(ringA);
    const ringB = ringA.clone();
    ringB.rotation.set(-0.82, 0.7, 0.58);
    ringB.scale.setScalar(1.08);
    group.add(ringB);

    const particleCount = 320;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      const theta = seeded(index * 4) * Math.PI * 2;
      const phi = Math.acos(seeded(index * 4 + 1) * 2 - 1);
      const jet = index % 19 === 0 ? 1.72 : 1.24;
      const radius = 0.92 + seeded(index * 4 + 2) * (jet - 0.92);
      const offset = index * 3;
      particlePositions[offset] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[offset + 1] = radius * Math.cos(phi);
      particlePositions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const hot = seeded(index * 4 + 3);
      particleColors[offset] = 1;
      particleColors[offset + 1] = 0.015 + hot * 0.2;
      particleColors[offset + 2] = 0;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.042,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particles);

    const clock = new THREE.Clock();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const draw = () => {
      const elapsed = reduceMotion ? 1.4 : clock.getElapsedTime();
      coreMaterial.uniforms.uTime.value = elapsed;
      coronaMaterial.uniforms.uTime.value = elapsed;
      group.rotation.y = elapsed * 1.9;
      group.rotation.z = Math.sin(elapsed * 1.35) * 0.24;
      ringA.rotation.z = -0.26 + elapsed * 2.8;
      ringB.rotation.y = 0.7 - elapsed * 2.1;
      const eruption = 1 + Math.max(0, Math.sin(elapsed * 4.4)) * 0.085;
      particles.scale.setScalar(eruption);
      corona.scale.setScalar(0.98 + Math.sin(elapsed * 5.5) * 0.035);
      renderer.render(scene, camera);
      if (!reduceMotion) frame = window.requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.cancelAnimationFrame(frame);
      coreGeometry.dispose();
      coreMaterial.dispose();
      coronaGeometry.dispose();
      coronaMaterial.dispose();
      ringA.geometry.dispose();
      ringMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [size]);

  return (
    <span
      ref={mountRef}
      className={`ackrate-solar-mark ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="ackrate-solar-fallback" />
    </span>
  );
}
