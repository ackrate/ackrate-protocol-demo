/**
 * The Clearing Hall — the authored environment behind the wallet workflow.
 *
 * One building on the -z axis. The agent side is the plaza outside, the
 * merchant side is the vault at the far end, and everything between is
 * ACKRATE: the catalog nave, the request console, the gate, the rail.
 *
 *   z  +24 ......... plaza (Connect)
 *   z  +12 ......... facade + doors
 *   z   +9 … -1 .... catalog nave (Marketplace)
 *   z   -2.5 ....... request console (Configure)
 *   z   -8 ......... the gate: iris + expiry ring (Limit)
 *   z   -9 … -26 ... the rail over the void (Run)
 *   z  -26.5 ....... the vault wall of settlement tablets (Proof)
 *
 * Everything is procedural so the route ships with zero binary assets.
 */
import * as THREE from "three";
import type { WorldSignals } from "./signals";

export interface Station {
  position: THREE.Vector3;
  look: THREE.Vector3;
}

export interface HallOptions {
  floorMaterial: THREE.Material;
  quality: "high" | "low";
}

export interface HallFrame {
  dt: number;
  elapsed: number;
  signals: WorldSignals;
  reducedMotion: boolean;
}

export interface Hall {
  scene: THREE.Scene;
  stations: Station[];
  /** World-space point the camera passes through between Limit and Run. */
  gateCenter: THREE.Vector3;
  update(frame: HallFrame): void;
  dispose(): void;
}

const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

export function buildHall({ floorMaterial, quality }: HallOptions): Hall {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.034);

  const resources: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  const random = seeded(48_203);

  /* ---------------------------------------------------------------- materials */
  const graphite = track(new THREE.MeshPhysicalMaterial({
    color: 0x0b0c10,
    metalness: 0.5,
    roughness: 0.48,
    clearcoat: 0.4,
    clearcoatRoughness: 0.35,
  }));
  const stone = track(new THREE.MeshStandardMaterial({ color: 0x0f1115, metalness: 0.25, roughness: 0.78 }));
  const facadeStone = track(new THREE.MeshPhysicalMaterial({ color: 0x14161b, metalness: 0.42, roughness: 0.52, clearcoat: 0.25, clearcoatRoughness: 0.5 }));
  const silver = track(new THREE.MeshPhysicalMaterial({
    color: 0xc4c9d2,
    metalness: 1,
    roughness: 0.2,
    iridescence: 0.5,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 420],
  }));
  const brushed = track(new THREE.MeshPhysicalMaterial({
    color: 0x7d838d,
    metalness: 0.95,
    roughness: 0.42,
    iridescence: 0.18,
    iridescenceIOR: 1.3,
  }));
  const glow = (r: number, g: number, b: number, opacity = 1) => track(new THREE.MeshBasicMaterial({
    color: new THREE.Color(r, g, b),
    toneMapped: false,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  }));
  const white = glow(1.9, 1.9, 2.0);

  /* ---------------------------------------------------------------- geometry */
  const box = (w: number, h: number, d: number) => track(new THREE.BoxGeometry(w, h, d));
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    scene.add(object);
    return object;
  };

  /* Floor: plaza + nave, then the vault landing. Both share one plane so one
     reflector can serve them. */
  const floorGeometry = track(new THREE.PlaneGeometry(1, 1));
  const naveFloor = new THREE.Mesh(floorGeometry, floorMaterial);
  naveFloor.rotation.x = -Math.PI / 2;
  naveFloor.scale.set(64, 48, 1);
  naveFloor.position.set(0, 0, 12.5);
  scene.add(naveFloor);
  const vaultFloor = new THREE.Mesh(floorGeometry, floorMaterial);
  vaultFloor.rotation.x = -Math.PI / 2;
  vaultFloor.scale.set(12, 3.2, 1);
  vaultFloor.position.set(0, 0, -25.6);
  scene.add(vaultFloor);

  /* Plaza: two light strips lead to the door; pylons give the approach scale. */
  const scratch = new THREE.Object3D();
  const strip = glow(0.5, 0.53, 0.6);
  mesh(box(0.03, 0.012, 22), strip, -1.35, 0.006, 23.5);
  mesh(box(0.03, 0.012, 22), strip, 1.35, 0.006, 23.5);
  const pylonGeometry = box(0.14, 5.2, 0.14);
  const pylons = new THREE.InstancedMesh(pylonGeometry, brushed, 12);
  for (let index = 0; index < 12; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    scratch.position.set(side * 7.5, 2.6, 15 + Math.floor(index / 2) * 3.6);
    scratch.rotation.set(0, 0, 0);
    scratch.updateMatrix();
    pylons.setMatrixAt(index, scratch.matrix);
    const cap = new THREE.Mesh(box(0.16, 0.05, 0.16), glow(0.9, 0.92, 1.0));
    cap.position.set(side * 7.5, 5.23, 15 + Math.floor(index / 2) * 3.6);
    scene.add(cap);
  }
  scene.add(pylons);
  const avenueLight = new THREE.PointLight(0xd9dfec, 3, 16, 1.6);
  avenueLight.position.set(0, 4.5, 20);
  scene.add(avenueLight);

  /* Facade: a monolith with a single tall opening and stone coursing. */
  mesh(box(18.8, 18, 0.7), facadeStone, -10.6, 9, 12);
  mesh(box(18.8, 18, 0.7), facadeStone, 10.6, 9, 12);
  mesh(box(2.4, 12, 0.7), facadeStone, 0, 12, 12);
  mesh(box(2.8, 0.12, 0.9), silver, 0, 6.06, 12);
  const coursingGeometry = box(18.4, 0.02, 0.06);
  const coursing = new THREE.InstancedMesh(coursingGeometry, track(new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.9 })), 26);
  for (let index = 0; index < 26; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    scratch.position.set(side * 10.6, 1.3 + Math.floor(index / 2) * 1.3, 12.36);
    scratch.updateMatrix();
    coursing.setMatrixAt(index, scratch.matrix);
  }
  scene.add(coursing);
  const facadeWash = new THREE.SpotLight(0xe4e8f2, 60, 30, 0.9, 0.7, 1.2);
  facadeWash.position.set(0, 12, 26);
  facadeWash.target.position.set(0, 6, 12);
  scene.add(facadeWash, facadeWash.target);
  const doorGeometry = box(1.2, 6, 0.28);
  const doorLeft = mesh(doorGeometry, graphite, -0.6, 3, 12);
  const doorRight = mesh(doorGeometry, graphite, 0.6, 3, 12);
  const doorSeam = mesh(box(0.03, 6, 0.06), white, 0, 3, 12.16);
  const shaft = new THREE.Mesh(track(new THREE.PlaneGeometry(2.4, 6)), glow(1.6, 1.62, 1.7, 0.95));
  shaft.position.set(0, 3, 11.55);
  scene.add(shaft);
  const shaftLight = new THREE.PointLight(0xe9edf7, 6, 18, 1.6);
  shaftLight.position.set(0, 3.2, 13.4);
  scene.add(shaftLight);

  /* Nave shell. */
  mesh(box(0.5, 9, 40), stone, -6.25, 4.5, -8);
  mesh(box(0.5, 9, 40), stone, 6.25, 4.5, -8);
  mesh(box(12.5, 0.4, 40), stone, 0, 9.2, -8);
  const pilasterGeometry = box(0.42, 9, 0.32);
  const pilasters = new THREE.InstancedMesh(pilasterGeometry, graphite, 26);
  for (let index = 0; index < 26; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    scratch.position.set(side * 5.82, 4.5, 11 - Math.floor(index / 2) * 3.15);
    scratch.updateMatrix();
    pilasters.setMatrixAt(index, scratch.matrix);
  }
  scene.add(pilasters);

  /* The line: a ceiling light that illuminates location by location. */
  const lineSegments: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  const segmentBounds = [[12, 9.5], [9.5, -1.2], [-1.2, -5.6], [-5.6, -10.6], [-10.6, -24.5], [-24.5, -26.3]] as const;
  segmentBounds.forEach(([from, to]) => {
    const length = from - to - 0.25;
    const segment = new THREE.Mesh(box(0.1, 0.04, length), glow(0.16, 0.17, 0.2));
    segment.position.set(0, 8.98, (from + to) / 2);
    scene.add(segment);
    lineSegments.push(segment);
  });

  /* The library: four shelves on each wall, packed with volumes of different
     heights and thicknesses. Most are graphite and silver cloth; a few are
     backlit, the live listings. Twelve slots on the right wall nearest the
     catalog station are the featured shelf: the service under the cursor in
     the list is pulled from that shelf. */
  const shelfHeights = [1.05, 2.8, 4.55, 6.3];
  const shelfFrom = 9.7;
  const shelfTo = -0.9;
  const shelfLength = shelfFrom - shelfTo;
  const plankGeometry = box(0.5, 0.05, shelfLength);
  const plankEdgeGeometry = box(0.02, 0.05, shelfLength);
  const uprightGeometry = box(0.5, 6.9, 0.06);
  const planks = new THREE.InstancedMesh(plankGeometry, graphite, shelfHeights.length * 2);
  const plankEdges = new THREE.InstancedMesh(plankEdgeGeometry, silver, shelfHeights.length * 2);
  shelfHeights.forEach((height, row) => {
    [-1, 1].forEach((side, sideIndex) => {
      scratch.position.set(side * 5.75, height - 0.025, (shelfFrom + shelfTo) / 2);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.setScalar(1);
      scratch.updateMatrix();
      planks.setMatrixAt(row * 2 + sideIndex, scratch.matrix);
      scratch.position.x = side * 5.51;
      scratch.updateMatrix();
      plankEdges.setMatrixAt(row * 2 + sideIndex, scratch.matrix);
    });
  });
  scene.add(planks, plankEdges);
  const uprightCount = 10;
  const uprights = new THREE.InstancedMesh(uprightGeometry, graphite, uprightCount);
  for (let index = 0; index < uprightCount; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    scratch.position.set(side * 5.75, 0.6 + 6.9 / 2, shelfFrom - Math.floor(index / 2) * (shelfLength / 4));
    scratch.updateMatrix();
    uprights.setMatrixAt(index, scratch.matrix);
  }
  scene.add(uprights);

  const bookGeometry = box(1, 1, 1);
  const bookMaterial = track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.62, clearcoat: 0.2, clearcoatRoughness: 0.5 }));
  const litMaterial = track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const spineTints = [0x101216, 0x15181e, 0x1c2027, 0x262b34, 0x343a44, 0x6d747f, 0xb7bcc5, 0xe4e6ea];
  const spineWeights = [3, 3, 3, 2, 1.5, 0.8, 0.5, 0.3];
  const pickTint = () => {
    const total = spineWeights.reduce((sum, weight) => sum + weight, 0);
    let roll = random() * total;
    for (let index = 0; index < spineTints.length; index += 1) {
      roll -= spineWeights[index]!;
      if (roll <= 0) return spineTints[index]!;
    }
    return spineTints[0]!;
  };
  type Volume = { side: number; row: number; z: number; height: number; thickness: number; lean: number; lit: boolean };
  const volumes: Volume[] = [];
  const litShare = quality === "high" ? 0.11 : 0.09;
  for (let side = -1; side <= 1; side += 2) {
    shelfHeights.forEach((height, row) => {
      let z = shelfFrom - 0.12;
      while (z > shelfTo + 0.12) {
        const thickness = 0.07 + random() * 0.2;
        if (z - thickness < shelfTo + 0.1) break;
        const bookHeight = 0.72 + random() * 0.62;
        volumes.push({ side, row, z: z - thickness / 2, height: bookHeight, thickness, lean: random() < 0.07 ? (random() - 0.5) * 0.16 : 0, lit: random() < litShare });
        z -= thickness + 0.012 + (random() < 0.06 ? 0.16 : 0);
      }
    });
  }
  const litVolumes = volumes.filter((volume) => volume.lit);
  const matteVolumes = volumes.filter((volume) => !volume.lit);
  const books = new THREE.InstancedMesh(bookGeometry, bookMaterial, matteVolumes.length);
  const litBooks = new THREE.InstancedMesh(bookGeometry, litMaterial, litVolumes.length);
  const slabColor = new THREE.Color();
  const placeVolume = (volume: Volume, pull: number) => {
    scratch.position.set(volume.side * (5.72 - pull), shelfHeights[volume.row]! + volume.height / 2, volume.z);
    scratch.rotation.set(0, 0, volume.lean * volume.side);
    scratch.scale.set(0.4, volume.height, volume.thickness);
    scratch.updateMatrix();
  };
  matteVolumes.forEach((volume, index) => {
    placeVolume(volume, 0);
    books.setMatrixAt(index, scratch.matrix);
    books.setColorAt(index, slabColor.setHex(pickTint()));
  });
  const litBase = new Float32Array(litVolumes.length);
  const litZ = new Float32Array(litVolumes.length);
  litVolumes.forEach((volume, index) => {
    placeVolume(volume, 0);
    litBooks.setMatrixAt(index, scratch.matrix);
    litBase[index] = 0.16 + random() * 0.3;
    litZ[index] = volume.z;
    litBooks.setColorAt(index, slabColor.setScalar(litBase[index]!));
  });
  scratch.scale.setScalar(1);
  scene.add(books, litBooks);
  /* Featured shelf: right wall, second row, the twelve volumes nearest the
     catalog station's line of sight. */
  const featured = litVolumes
    .map((volume, index) => ({ volume, index }))
    .filter(({ volume }) => volume.side === 1 && volume.row === 1 && volume.z < 5.5 && volume.z > -0.6)
    .slice(0, 12);
  const featuredPull = new Float32Array(featured.length);
  const slabCount = litVolumes.length;
  const naveLightA = new THREE.PointLight(0xdfe4ee, 6, 16, 1.7);
  naveLightA.position.set(0, 6.5, 6);
  const naveLightB = new THREE.PointLight(0xdfe4ee, 6, 16, 1.7);
  naveLightB.position.set(2.6, 6.2, 2.4);
  scene.add(naveLightA, naveLightB);

  /* Request console: a slab under a single beam. */
  mesh(box(2.4, 0.86, 1.02), graphite, 0, 0.43, -2.5);
  const consoleTop = mesh(box(2.52, 0.05, 1.12), graphite, 0, 0.885, -2.5);
  mesh(box(2.56, 0.012, 1.16), silver, 0, 0.858, -2.5);
  const fieldLineGeometry = box(1.7, 0.012, 0.028);
  const fieldLines: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let index = 0; index < 4; index += 1) {
    const line = new THREE.Mesh(fieldLineGeometry, glow(0.35, 0.37, 0.42));
    line.position.set(0.1, 0.915, -2.86 + index * 0.24);
    scene.add(line);
    fieldLines.push(line);
  }
  const consoleGlow = mesh(box(2.52, 0.012, 1.12), glow(0.5, 0.52, 0.6, 0.0), 0, 0.912, -2.5);
  const beamCone = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.22, 1.35, 8.05, 40, 1, true)),
    track(new THREE.MeshBasicMaterial({
      color: 0xdde3f0,
      transparent: true,
      opacity: 0.03,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })),
  );
  beamCone.position.set(0, 4.95, -2.5);
  scene.add(beamCone);
  const beam = new THREE.SpotLight(0xffffff, 40, 12, 0.32, 0.55, 1.4);
  beam.position.set(0, 8.9, -2.5);
  beam.target.position.set(0, 0.9, -2.5);
  scene.add(beam, beam.target);
  const beamCap = mesh(track(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 32)), white, 0, 8.94, -2.5);

  /* The gate: a wall with a circular opening, an iris of silver blades, an
     expiry ring. */
  const gateShape = new THREE.Shape();
  gateShape.moveTo(-6.3, 0);
  gateShape.lineTo(6.3, 0);
  gateShape.lineTo(6.3, 9.2);
  gateShape.lineTo(-6.3, 9.2);
  gateShape.closePath();
  const gateHole = new THREE.Path();
  gateHole.absarc(0, 3.2, 2.3, 0, Math.PI * 2, true);
  gateShape.holes.push(gateHole);
  const gateGeometry = track(new THREE.ExtrudeGeometry(gateShape, { depth: 0.5, bevelEnabled: false, curveSegments: 96 }));
  const gateStone = track(new THREE.MeshStandardMaterial({ color: 0x0c0d11, metalness: 0.2, roughness: 0.82 }));
  const gateWall = new THREE.Mesh(gateGeometry, gateStone);
  gateWall.position.set(0, 0, -10.25);
  scene.add(gateWall);
  const gateRim = new THREE.Mesh(track(new THREE.TorusGeometry(2.3, 0.035, 12, 128)), silver);
  gateRim.position.set(0, 3.2, -9.99);
  scene.add(gateRim);

  const gateCenter = new THREE.Vector3(0, 3.2, -10);
  const iris = new THREE.Group();
  iris.position.copy(gateCenter);
  scene.add(iris);
  const bladeGeometry = box(1.25, 0.15, 0.035);
  const bladePivots: THREE.Object3D[] = [];
  const blades: THREE.Mesh[] = [];
  for (let index = 0; index < 12; index += 1) {
    const pivot = new THREE.Object3D();
    pivot.rotation.z = (index / 12) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeometry, silver);
    blade.position.x = 1.3;
    pivot.add(blade);
    iris.add(pivot);
    bladePivots.push(pivot);
    blades.push(blade);
  }
  const apertureRing = new THREE.Mesh(track(new THREE.TorusGeometry(1, 0.022, 10, 128)), glow(1.4, 1.45, 1.6));
  iris.add(apertureRing);
  const gateLight = new THREE.PointLight(0xe6ebf7, 1.2, 7, 2);
  gateLight.position.set(0, 3.2, -7.6);
  scene.add(gateLight);

  const expiryCount = 72;
  const expiryGeometry = box(0.045, 0.17, 0.028);
  const expiryMaterial = track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const expiryRing = new THREE.InstancedMesh(expiryGeometry, expiryMaterial, expiryCount);
  for (let index = 0; index < expiryCount; index += 1) {
    const angle = Math.PI / 2 - (index / expiryCount) * Math.PI * 2;
    scratch.position.set(Math.cos(angle) * 2.62, 3.2 + Math.sin(angle) * 2.62, -9.94);
    scratch.rotation.set(0, 0, angle);
    scratch.updateMatrix();
    expiryRing.setMatrixAt(index, scratch.matrix);
    expiryRing.setColorAt(index, slabColor.setScalar(0.1));
  }
  scene.add(expiryRing);

  /* The rail: a bridge over the void with checkpoints and a track. */
  mesh(box(1.9, 0.16, 15.8), graphite, 0, -0.08, -18.4);
  mesh(box(0.05, 0.012, 15.4), silver, -0.86, 0.006, -18.4);
  mesh(box(0.05, 0.012, 15.4), silver, 0.86, 0.006, -18.4);
  const trackLine = mesh(box(0.045, 0.012, 15.4), glow(0.28, 0.3, 0.36), 0, 0.007, -18.4);
  const checkpoints: { z: number; light: THREE.PointLight; lintel: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> }[] = [];
  const postGeometry = box(0.07, 2.7, 0.07);
  const lintelGeometry = box(2.2, 0.06, 0.06);
  [-13.4, -16.6, -19.8, -23].forEach((z) => {
    mesh(postGeometry, silver, -1.05, 1.35, z);
    mesh(postGeometry, silver, 1.05, 1.35, z);
    const lintel = new THREE.Mesh(lintelGeometry, glow(0.22, 0.23, 0.28));
    lintel.position.set(0, 2.72, z);
    scene.add(lintel);
    const light = new THREE.PointLight(0xffffff, 0, 5, 2);
    light.position.set(0, 2.4, z);
    scene.add(light);
    checkpoints.push({ z, light, lintel });
  });
  const packet = new THREE.Mesh(track(new THREE.SphereGeometry(0.075, 20, 16)), white);
  const packetLight = new THREE.PointLight(0xf4f6ff, 0, 5, 2);
  packet.add(packetLight);
  packet.visible = false;
  scene.add(packet);
  const trailCount = 18;
  const trail = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.03, 8, 6)), track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.9 })), trailCount);
  trail.visible = false;
  scene.add(trail);
  const trailPositions: THREE.Vector3[] = Array.from({ length: trailCount }, () => new THREE.Vector3());

  /* The vault: a wall of settlement tablets. */
  mesh(box(12.5, 9.4, 0.6), stone, 0, 4.6, -26.6);
  const tabletColumns = 7;
  const tabletRows = 4;
  const tabletGeometry = box(0.86, 1.22, 0.06);
  const tabletMaterial = track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const tablets = new THREE.InstancedMesh(tabletGeometry, tabletMaterial, tabletColumns * tabletRows);
  const tabletBase = new Float32Array(tabletColumns * tabletRows);
  for (let index = 0; index < tabletColumns * tabletRows; index += 1) {
    const column = index % tabletColumns;
    const row = Math.floor(index / tabletColumns);
    scratch.position.set(-3.6 + column * 1.2, 1.6 + row * 1.78, -26.25);
    scratch.rotation.set(0, 0, 0);
    scratch.updateMatrix();
    tablets.setMatrixAt(index, scratch.matrix);
    tabletBase[index] = 0.02 + random() * 0.03;
    tablets.setColorAt(index, slabColor.setScalar(tabletBase[index]!));
  }
  scene.add(tablets);
  const proofTablets = [9, 18];
  const vaultLight = new THREE.PointLight(0xe8ecf6, 3, 12, 1.6);
  vaultLight.position.set(0, 4.5, -23.5);
  scene.add(vaultLight);

  /* Ambient: hemisphere + a long key light from the door side. */
  scene.add(new THREE.HemisphereLight(0x8f97a6, 0x05060a, 0.36));
  const key = new THREE.DirectionalLight(0xdde3f0, 0.55);
  key.position.set(3, 12, 20);
  scene.add(key);

  /* Dust in the light. */
  const dustCount = quality === "high" ? 520 : 220;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  for (let index = 0; index < dustCount; index += 1) {
    dustPositions[index * 3] = (random() - 0.5) * 10;
    dustPositions[index * 3 + 1] = 0.3 + random() * 8;
    dustPositions[index * 3 + 2] = 11 - random() * 36;
    dustSeed[index] = random() * Math.PI * 2;
  }
  const dustGeometry = track(new THREE.BufferGeometry());
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, track(new THREE.PointsMaterial({
    color: 0xc9cfdb,
    size: 0.028,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })));
  scene.add(dust);

  /* ---------------------------------------------------------------- stations */
  const stations: Station[] = [
    { position: new THREE.Vector3(0, 1.75, 28.5), look: new THREE.Vector3(0, 4.6, 12) },
    { position: new THREE.Vector3(-2.5, 2.2, 8.4), look: new THREE.Vector3(3.4, 3.4, -2.2) },
    { position: new THREE.Vector3(2.05, 1.45, -0.55), look: new THREE.Vector3(-0.3, 0.95, -2.75) },
    { position: new THREE.Vector3(0, 2.5, -3.2), look: new THREE.Vector3(0, 3.25, -10) },
    { position: new THREE.Vector3(0, 2.3, -13.3), look: new THREE.Vector3(0, 2.15, -23.5) },
    { position: new THREE.Vector3(0, 2.6, -16.6), look: new THREE.Vector3(0, 3.9, -26.4) },
  ];

  /* ---------------------------------------------------------------- state */
  let doorOpen = 0;
  let admitted = 0;
  let catalogWave = -10;
  let seenCatalogVersion = 0;
  let chosen = 0;
  let requestFill = 0;
  let apertureRadius = 1.0;
  let expiryLit = 0;
  let armed = 0;
  let registered = 0;
  let packetU = 0;
  let packetEnergy = 0;
  let settled = 0;
  const lineLevels = new Float32Array(6);
  const fieldLevels = new Float32Array(4);

  const update = ({ dt, elapsed, signals, reducedMotion }: HallFrame) => {
    const step = Math.min(dt, 0.05);
    const ease = reducedMotion ? 14 : 3.2;

    /* Doors: part when a wallet answers, stay open once inside. */
    doorOpen = damp(doorOpen, signals.connected || signals.verified || signals.stage > 1 ? 1 : 0, reducedMotion ? 16 : 2.1, step);
    doorLeft.position.x = -0.6 - doorOpen * 1.22;
    doorRight.position.x = 0.6 + doorOpen * 1.22;
    doorSeam.visible = doorOpen < 0.35;
    doorSeam.scale.x = Math.max(0.05, 1 + doorOpen * 40);
    admitted = damp(admitted, signals.stage > 1 ? 1 : 0, ease, step);
    (shaft.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - admitted);
    shaft.visible = admitted < 0.98;
    shaftLight.intensity = 4 + doorOpen * 5;

    /* The line lights up to the active location. */
    for (let index = 0; index < 6; index += 1) {
      const target = index < signals.stage - 1 ? 0.55 : index === signals.stage - 1 ? 1.55 : 0.09;
      lineLevels[index] = damp(lineLevels[index]!, target, ease, step);
      lineSegments[index]!.material.color.setScalar(lineLevels[index]!);
    }

    /* Library: a wave rolls along the shelves when results arrive; the volume
       under the cursor in the list is pulled from the featured shelf. */
    if (signals.catalogVersion !== seenCatalogVersion) {
      seenCatalogVersion = signals.catalogVersion;
      catalogWave = 0;
    }
    catalogWave += step * (reducedMotion ? 60 : 9);
    chosen = damp(chosen, signals.serviceChosen ? 1 : 0, ease, step);
    const catalogActive = signals.stage === 2 ? 1.7 : signals.stage > 2 ? 0.6 : 0.3;
    const focusSlot = signals.catalogFocus >= 0 && featured.length > 0 ? signals.catalogFocus % featured.length : -1;
    for (let index = 0; index < slabCount; index += 1) {
      const distance = Math.abs((shelfFrom - litZ[index]!) - catalogWave);
      const wave = Math.max(0, 1 - distance / 1.6) * 0.9;
      const shimmer = reducedMotion ? 0 : Math.sin(elapsed * 0.9 + index * 1.37) * 0.02;
      const level = (litBase[index]! + shimmer) * catalogActive * (1 + chosen * 0.35) + wave;
      litBooks.setColorAt(index, slabColor.setScalar(level));
    }
    featured.forEach(({ volume, index }, slot) => {
      const target = slot === focusSlot ? 1 : 0;
      featuredPull[slot] = damp(featuredPull[slot]!, target, reducedMotion ? 16 : 6, step);
      const pull = featuredPull[slot]!;
      placeVolume(volume, pull * 0.16);
      litBooks.setMatrixAt(index, scratch.matrix);
      litBooks.setColorAt(index, slabColor.setScalar(litBase[index]! * catalogActive + pull * 1.5));
    });
    scratch.scale.setScalar(1);
    litBooks.instanceMatrix.needsUpdate = true;
    litBooks.instanceColor!.needsUpdate = true;
    naveLightA.intensity = 3 + catalogActive * 2;
    naveLightB.intensity = 3 + catalogActive * 2 + chosen * 2;

    /* Console: field lines fill as the request is written. */
    requestFill = damp(requestFill, signals.requestFill, ease, step);
    const consoleActive = signals.stage === 3 ? 1 : signals.stage > 3 ? 0.4 : 0.15;
    for (let index = 0; index < 4; index += 1) {
      const filled = THREE.MathUtils.clamp(requestFill * 4 - index, 0, 1);
      fieldLevels[index] = damp(fieldLevels[index]!, 0.25 + filled * 1.4, ease, step);
      fieldLines[index]!.material.color.setScalar(fieldLevels[index]! * (0.3 + consoleActive * 0.7));
    }
    (consoleGlow.material as THREE.MeshBasicMaterial).opacity = 0.04 + consoleActive * 0.12 * requestFill;
    beam.intensity = 6 + consoleActive * 22;
    (beamCone.material as THREE.MeshBasicMaterial).opacity = 0.005 + consoleActive * 0.03;
    beamCap.material = consoleActive > 0.5 ? white : brushed;
    consoleTop.material = graphite;

    /* Gate: the aperture is the spending limit; the ring is the window. */
    const openTarget = signals.stage >= 5 ? 2.12 : 0.55 + signals.aperture * 1.5;
    apertureRadius = damp(apertureRadius, openTarget, reducedMotion ? 16 : 4.5, step);
    for (let index = 0; index < 12; index += 1) {
      blades[index]!.position.x = apertureRadius + 0.6;
      bladePivots[index]!.rotation.z = (index / 12) * Math.PI * 2 + (signals.stage >= 5 ? 0.18 : 0);
    }
    apertureRing.scale.setScalar(apertureRadius);
    registered = damp(registered, signals.limitRegistered ? 1 : 0, ease, step);
    armed = damp(armed, signals.limitArmed ? 1 : 0, ease, step);
    const gateActive = signals.stage === 4 ? 1 : signals.stage > 4 ? 0.7 : signals.stage === 3 ? 0.2 : 0.08;
    (apertureRing.material as THREE.MeshBasicMaterial).color.setScalar(0.3 + gateActive * 0.5 + armed * 0.9);
    gateLight.intensity = 0.5 + gateActive * 1.1 + armed * 1.6;
    expiryLit = damp(expiryLit, signals.expiry, ease, step);
    for (let index = 0; index < expiryCount; index += 1) {
      const lit = index / expiryCount < expiryLit;
      expiryRing.setColorAt(index, slabColor.setScalar(lit ? 0.25 + gateActive * 0.8 + registered * 0.8 : 0.07));
    }
    expiryRing.instanceColor!.needsUpdate = true;

    /* Rail: the payment travels only while a request is in flight. */
    const railActive = signals.stage === 5 ? 1 : signals.stage === 6 ? 0.7 : 0.1;
    (trackLine.material as THREE.MeshBasicMaterial).color.setScalar(0.12 + railActive * 0.4 + packetEnergy * 0.4);
    const shouldTravel = signals.running && signals.stage === 5 && !reducedMotion;
    packetEnergy = damp(packetEnergy, shouldTravel ? 1 : 0, 3, step);
    if (shouldTravel) {
      packetU = (packetU + step * 0.21) % 1;
    } else if (signals.settled) {
      packetU = damp(packetU, 1, 4, step);
    }
    const packetZ = -10.6 - packetU * 14.6;
    packet.visible = packetEnergy > 0.02 || (signals.settled && signals.stage >= 5);
    packet.position.set(0, 0.42 + Math.sin(packetU * Math.PI) * 0.35, packetZ);
    packet.scale.setScalar(signals.settled && !shouldTravel ? 0.6 : 1);
    packetLight.intensity = 2 + packetEnergy * 6;
    trail.visible = packetEnergy > 0.05;
    for (let index = trailCount - 1; index > 0; index -= 1) trailPositions[index]!.copy(trailPositions[index - 1]!);
    trailPositions[0]!.copy(packet.position);
    for (let index = 0; index < trailCount; index += 1) {
      const fade = 1 - index / trailCount;
      scratch.position.copy(trailPositions[index]!);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.setScalar(0.25 + fade * 0.9);
      scratch.updateMatrix();
      trail.setMatrixAt(index, scratch.matrix);
    }
    trail.instanceMatrix.needsUpdate = true;
    scratch.scale.setScalar(1);
    checkpoints.forEach((checkpoint) => {
      const near = Math.max(0, 1 - Math.abs(packetZ - checkpoint.z) / 1.6) * packetEnergy;
      const level = 0.12 + railActive * 0.25 + near * 1.4 + (signals.settled ? 0.45 : 0);
      checkpoint.lintel.material.color.setScalar(level);
      checkpoint.light.intensity = near * 5 + (signals.settled ? 0.8 : 0) + railActive * 0.4;
    });

    /* Vault: settlement evidence lights two tablets. */
    settled = damp(settled, signals.settled ? 1 : 0, ease, step);
    const vaultActive = signals.stage === 6 ? 1 : signals.stage === 5 ? 0.45 : 0.12;
    for (let index = 0; index < tabletColumns * tabletRows; index += 1) {
      const proof = proofTablets.includes(index) ? settled : 0;
      const breathe = reducedMotion ? 0 : Math.sin(elapsed * 1.1 + index) * 0.01;
      tablets.setColorAt(index, slabColor.setScalar((tabletBase[index]! + breathe * 0.5) * (0.5 + vaultActive) + proof * 1.7));
    }
    tablets.instanceColor!.needsUpdate = true;
    vaultLight.intensity = 1.2 + vaultActive * 3 + settled * 6;

    /* Dust drifts; it holds still under reduced motion. */
    if (!reducedMotion) {
      const attribute = dustGeometry.getAttribute("position") as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let index = 0; index < dustCount; index += 1) {
        const seed = dustSeed[index]!;
        array[index * 3] += Math.sin(elapsed * 0.35 + seed) * 0.0011;
        array[index * 3 + 1] += (Math.cos(elapsed * 0.27 + seed * 1.3) * 0.0009) + 0.00025;
        if (array[index * 3 + 1]! > 8.6) array[index * 3 + 1] = 0.3;
      }
      attribute.needsUpdate = true;
    }
  };

  const dispose = () => {
    scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    resources.forEach((resource) => resource.dispose());
    scene.clear();
  };

  return { scene, stations, gateCenter, update, dispose };
}
