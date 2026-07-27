import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  Calibration,
  DrawingPath,
} from "../../../../shared/renewableEnergy/drawing/drawingTypes";
import { normalizePaths } from "../../../../shared/renewableEnergy/drawing/drawingCore";
import {
  createDrawingCameraState,
  type DrawingCameraView,
} from "../../../../shared/renewableEnergy/drawing/drawing3dCore";

export function Drawing3DPreview({
  paths,
  calibration,
}: {
  paths: DrawingPath[];
  calibration: Calibration;
}) {
  const container = useRef<HTMLDivElement>(null);
  const cameraResources = useRef<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    aspect: number;
  } | null>(null);
  const [view, setView] = useState<DrawingCameraView>("isometric");
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "context-lost">(
    "loading",
  );
  const normalized = useMemo(() => normalizePaths(paths, calibration), [calibration, paths]);
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Planar accepted drawing geometry 3D review");
    host.append(canvas);
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) {
      setStatus("unavailable");
      canvas.remove();
      return;
    }
    const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor("#0b1020");
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const disposables: { geometry: THREE.BufferGeometry; material: THREE.LineBasicMaterial }[] = [];
    for (const path of normalized.slice(0, 10_000)) {
      const points = path.points.map((point) => new THREE.Vector3(point.x, 0, -point.y));
      if (path.closed && points.length) points.push(points[0].clone());
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: "#22c55e" });
      group.add(new THREE.Line(geometry, material));
      disposables.push({ geometry, material });
    }
    scene.add(group);
    const flatPoints = normalized.flatMap((path) => path.points);
    const initial = createDrawingCameraState(flatPoints, "isometric", 1);
    const size = initial.distance;
    const camera = new THREE.PerspectiveCamera(45, 1, size / 10_000, size * 100);
    camera.position.set(initial.position.x, initial.position.y, initial.position.z);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(initial.target.x, initial.target.y, initial.target.z);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    controls.maxDistance = size * 20;
    controls.update();
    let active = true;
    let frame = 0;
    const resize = () => {
      const width = Math.max(host.clientWidth, 280);
      const height = Math.max(host.clientHeight, 360);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (cameraResources.current) cameraResources.current.aspect = camera.aspect;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    cameraResources.current = { camera, controls, aspect: 1 };
    resize();
    const lost = (event: Event) => {
      event.preventDefault();
      if (active) setStatus("context-lost");
    };
    const restored = () => active && setStatus("ready");
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    const render = () => {
      if (!active) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    setStatus("ready");
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      controls.dispose();
      disposables.forEach(({ geometry, material }) => {
        geometry.dispose();
        material.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      cameraResources.current = null;
    };
  }, [normalized]);
  const setCamera = (next: DrawingCameraView) => {
    const current = cameraResources.current;
    if (!current) return;
    const state = createDrawingCameraState(
      normalized.flatMap((path) => path.points),
      next,
      current.aspect,
    );
    current.camera.position.set(state.position.x, state.position.y, state.position.z);
    current.camera.near = state.near;
    current.camera.far = state.far;
    current.camera.updateProjectionMatrix();
    current.controls.target.set(state.target.x, state.target.y, state.target.z);
    current.controls.update();
    setView(next);
  };
  return (
    <section className="rounded-2xl border border-glass-border bg-card/50 p-5">
      <h2 className="text-2xl font-semibold">Planar 3D review</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Accepted geometry is shown on a zero-height review plane. No extrusion, elevation, or
        engineering meaning is inferred. Orbit, pan, and zoom are available.
      </p>
      <p aria-live="polite" className="mt-2 text-sm">
        Renderer: {status.replace("-", " ")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Planar 3D camera views">
        <button className={controlClass} onClick={() => setCamera("top")}>
          Top view
        </button>
        <button className={controlClass} onClick={() => setCamera("isometric")}>
          Isometric view
        </button>
        <button className={controlClass} onClick={() => setCamera(view)}>
          Fit geometry
        </button>
        <button className={controlClass} onClick={() => setCamera("isometric")}>
          Reset view
        </button>
      </div>
      <div
        ref={container}
        role="img"
        aria-label="Accepted planar drawing geometry"
        className="mt-4 min-h-[420px] overflow-hidden rounded-xl bg-[#0b1020]"
      />
      {status === "unavailable" && (
        <p role="alert" className="mt-3 rounded-xl bg-warning/10 p-4 text-sm">
          WebGL is unavailable. The complete 2D engineering review remains available.
        </p>
      )}
    </section>
  );
}

const controlClass =
  "rounded-xl border border-glass-border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
