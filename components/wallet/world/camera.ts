/**
 * Camera rig: the workflow moves the camera along one continuous path through
 * the hall. Progress is the only thing React controls; easing, parallax and
 * drag-look live here so the motion always reads as a person walking, never a
 * cut.
 */
import * as THREE from "three";
import type { Station } from "./hall";

export interface FocusOffset {
  /** Horizontal shift of the focal point in screen fractions (+ = right). */
  x: number;
  /** Vertical shift of the focal point in screen fractions (+ = up). */
  y: number;
}

export interface RigFrame {
  dt: number;
  stage: number;
  reducedMotion: boolean;
  pointer: THREE.Vector2;
  dragYaw: number;
  dragPitch: number;
  focus: FocusOffset;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly stationU: number[];
  private readonly stations: Station[];
  private progress: number;
  private readonly look = new THREE.Vector3();
  private readonly lookGoal = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly pointer = new THREE.Vector2();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly forward = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private settled = false;
  private clock = 0;

  constructor(stations: Station[], waypoint: { after: number; point: THREE.Vector3 }) {
    this.stations = stations;
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.08, 120);
    const points: THREE.Vector3[] = [];
    const stationIndexToPoint: number[] = [];
    stations.forEach((station, index) => {
      stationIndexToPoint.push(points.length);
      points.push(station.position.clone());
      if (index === waypoint.after) points.push(waypoint.point.clone());
    });
    this.curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
    const divisions = 600;
    const lengths = this.curve.getLengths(divisions);
    const total = lengths[divisions]!;
    this.stationU = stationIndexToPoint.map((pointIndex) => {
      const t = pointIndex / (points.length - 1);
      return lengths[Math.round(t * divisions)]! / total;
    });
    this.progress = this.stationU[0]!;
    this.position.copy(stations[0]!.position);
    this.look.copy(stations[0]!.look);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);
  }

  /** Jump the rig to a stage without travelling (first paint, reduced motion). */
  snapTo(stage: number) {
    const index = THREE.MathUtils.clamp(stage - 1, 0, this.stations.length - 1);
    this.progress = this.stationU[index]!;
    this.position.copy(this.stations[index]!.position);
    this.look.copy(this.stations[index]!.look);
    this.settled = true;
  }

  /** Start behind the first station so the opening shot is an approach. */
  startApproach(distance = 0.045) {
    this.progress = Math.max(0, this.stationU[0]! - distance);
    this.settled = false;
  }

  get isSettled() {
    return this.settled;
  }

  update({ dt, stage, reducedMotion, pointer, dragYaw, dragPitch, focus }: RigFrame) {
    const step = Math.min(dt, 0.05);
    const index = THREE.MathUtils.clamp(stage - 1, 0, this.stations.length - 1);
    const targetU = this.stationU[index]!;
    const distance = Math.abs(targetU - this.progress);
    const lambda = reducedMotion ? 18 : 0.85 + Math.min(0.55, distance * 2.2);
    this.progress += (targetU - this.progress) * (1 - Math.exp(-lambda * step));
    this.settled = Math.abs(targetU - this.progress) < 0.0005;

    const u = THREE.MathUtils.clamp(this.progress, 0, 1);
    this.curve.getPointAt(u, this.position);

    /* Look target: blend between the stations the camera is between. */
    let from = 0;
    for (let station = 0; station < this.stationU.length - 1; station += 1) {
      if (u >= this.stationU[station]!) from = station;
    }
    const to = Math.min(from + 1, this.stations.length - 1);
    const span = Math.max(1e-5, this.stationU[to]! - this.stationU[from]!);
    const blend = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((u - this.stationU[from]!) / span, 0, 1), 0, 1);
    this.lookGoal.lerpVectors(this.stations[from]!.look, this.stations[to]!.look, blend);
    this.look.lerp(this.lookGoal, 1 - Math.exp(-(reducedMotion ? 18 : 2.8) * step));

    /* Pointer parallax and drag look. */
    this.pointer.lerp(pointer, 1 - Math.exp(-(reducedMotion ? 30 : 1.6) * step));
    const parallax = reducedMotion ? 0 : 1;
    this.forward.subVectors(this.look, this.position).normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
    const range = this.position.distanceTo(this.look);
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * range;
    const viewWidth = viewHeight * this.camera.aspect;

    /* A breath of handheld drift so a still frame never reads as a render. */
    this.clock += step;
    const sway = reducedMotion ? 0 : 1;
    this.camera.position.copy(this.position)
      .addScaledVector(this.right, this.pointer.x * 0.08 * parallax + Math.sin(this.clock * 0.3) * 0.012 * sway)
      .addScaledVector(this.up, -this.pointer.y * 0.045 * parallax + Math.sin(this.clock * 0.43 + 1.3) * 0.008 * sway);

    this.scratch.copy(this.look)
      .addScaledVector(this.right, -focus.x * viewWidth + this.pointer.x * 0.11 * parallax)
      .addScaledVector(this.up, -focus.y * viewHeight - this.pointer.y * 0.06 * parallax);

    /* Drag rotates the view around the camera itself. */
    if (dragYaw !== 0 || dragPitch !== 0) {
      this.scratch.sub(this.camera.position);
      this.scratch.applyAxisAngle(this.up, -dragYaw);
      this.scratch.applyAxisAngle(this.right, dragPitch);
      this.scratch.add(this.camera.position);
    }
    this.camera.lookAt(this.scratch);
  }
}
