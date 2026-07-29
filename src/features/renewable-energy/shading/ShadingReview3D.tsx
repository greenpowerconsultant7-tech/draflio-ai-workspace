import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LayoutReview } from "../../../../shared/renewableEnergy/layout/layoutTypes";
import type { TerrainMesh } from "../../../../shared/renewableEnergy/terrain/terrainTypes";
import {
  cameraDistance,
  cameraTarget,
  prepareShading3DSceneData,
} from "../../../../shared/renewableEnergy/shading/shading3D";
import type {
  Obstruction,
  ShadingFinding,
} from "../../../../shared/renewableEnergy/shading/shadingTypes";

export function ShadingReview3D({
  layout,
  terrain,
  obstructions,
  findings,
}: {
  layout?: LayoutReview;
  terrain?: TerrainMesh;
  obstructions: Obstruction[];
  findings: ShadingFinding[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("3D engineering review has not started.");
  const [view, setView] = useState<"initial" | "top" | "isometric" | "fit-site" | "fit-selection">(
    "initial",
  );
  const [selectedId, setSelectedId] = useState("");
  const [layers, setLayers] = useState({
    terrain: true,
    polygons: true,
    tables: true,
    obstructions: true,
    shadows: true,
    evidence: true,
  });
  const data = useMemo(() => {
    try {
      return layout
        ? prepareShading3DSceneData(layout, terrain, obstructions, findings)
        : undefined;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "3D scene preparation failed.");
      return undefined;
    }
  }, [findings, layout, obstructions, terrain]);

  useEffect(() => {
    if (!host.current || !data) return;
    const container = host.current;
    let frame = 0;
    let stopped = false;
    let renderer: THREE.WebGLRenderer | undefined;
    const disposables: { dispose(): void }[] = [];
    const listeners: [EventTarget, string, EventListener][] = [];
    const scene = new THREE.Scene();
    const target = cameraTarget(data);
    const distance = cameraDistance(data);
    const camera = new THREE.PerspectiveCamera(
      45,
      1,
      Math.max(0.01, distance / 10_000),
      distance * 20,
    );
    const render = () => {
      if (!stopped && renderer) renderer.render(scene, camera);
    };
    const line = (points: readonly { x: number; y: number }[], color: number, z = 0) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map((point) => new THREE.Vector3(point.x, z, -point.y)),
      );
      const material = new THREE.LineBasicMaterial({ color });
      disposables.push(geometry, material);
      scene.add(new THREE.Line(geometry, material));
    };
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.setAttribute("aria-label", "Technical Three.js shading engineering view");
      container.append(renderer.domElement);
      if (layers.terrain && data.terrain.triangles.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            data.terrain.vertices.flatMap((point) => [point.x, point.z, -point.y]),
            3,
          ),
        );
        geometry.setIndex(data.terrain.triangles.flat());
        geometry.computeVertexNormals();
        const material = new THREE.MeshBasicMaterial({
          color: 0x64748b,
          wireframe: true,
          side: THREE.DoubleSide,
        });
        disposables.push(geometry, material);
        scene.add(new THREE.Mesh(geometry, material));
      }
      if (layers.polygons && data.siteBoundary) line(data.siteBoundary, 0xca8a04);
      if (layers.polygons) {
        data.exclusions.forEach((points) => line(points, 0xb91c1c, 0.03));
        data.arrayAreas.forEach((points) => line(points, 0x2563eb, 0.04));
      }
      if (layers.tables)
        data.tables.forEach((table) => line(table.footprint, 0x16a34a, table.elevation + 0.08));
      if (layers.shadows) data.shadows.forEach((shadow) => line(shadow.points, 0xdc2626, 0.1));
      if (layers.obstructions)
        data.obstructions.forEach((item) => {
          line(item.footprint, 0x7c3aed, item.baseElevationMeters);
          line(item.footprint, 0x7c3aed, item.baseElevationMeters + item.heightMeters);
        });
      if (layers.evidence) {
        const evidencePoints = [
          ...data.samples.map((item) => new THREE.Vector3(item.point.x, 0.15, -item.point.y)),
          ...data.blockingPoints.map((item) => new THREE.Vector3(item.x, item.z, -item.y)),
        ];
        if (evidencePoints.length) {
          const geometry = new THREE.BufferGeometry().setFromPoints(evidencePoints);
          const material = new THREE.PointsMaterial({
            color: 0xbe123c,
            size: 5,
            sizeAttenuation: false,
          });
          disposables.push(geometry, material);
          scene.add(new THREE.Points(geometry, material));
        }
        const sun = findings[0]?.sunPosition;
        if (sun) {
          const azimuth = (sun.azimuthDegrees * Math.PI) / 180;
          const elevation = (sun.elevationDegrees * Math.PI) / 180;
          const length = distance * 0.6;
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(target.x, target.z, -target.y),
            new THREE.Vector3(
              target.x + Math.sin(azimuth) * Math.cos(elevation) * length,
              target.z + Math.sin(elevation) * length,
              -target.y - Math.cos(azimuth) * Math.cos(elevation) * length,
            ),
          ]);
          const material = new THREE.LineBasicMaterial({ color: 0xf59e0b });
          disposables.push(geometry, material);
          scene.add(new THREE.Line(geometry, material));
        }
      }
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(target.x, target.z, -target.y);
      controls.enableDamping = false;
      controls.addEventListener("change", render);
      disposables.push(controls);
      const applyCamera = () => {
        const selection =
          data.tables.find((item) => item.id === selectedId)?.footprint ??
          data.obstructions.find((item) => item.id === selectedId)?.footprint ??
          data.shadows.find((item) => item.id === selectedId)?.points;
        const selectionBounds = selection?.reduce(
          (bounds, point) => ({
            minX: Math.min(bounds.minX, point.x),
            minY: Math.min(bounds.minY, point.y),
            maxX: Math.max(bounds.maxX, point.x),
            maxY: Math.max(bounds.maxY, point.y),
          }),
          {
            minX: Number.POSITIVE_INFINITY,
            minY: Number.POSITIVE_INFINITY,
            maxX: Number.NEGATIVE_INFINITY,
            maxY: Number.NEGATIVE_INFINITY,
          },
        );
        const selectedTarget =
          view === "fit-selection" && selectionBounds
            ? {
                x: (selectionBounds.minX + selectionBounds.maxX) / 2,
                y: (selectionBounds.minY + selectionBounds.maxY) / 2,
                z: target.z,
              }
            : target;
        const selectedDistance =
          view === "fit-selection" && selectionBounds
            ? Math.max(
                selectionBounds.maxX - selectionBounds.minX,
                selectionBounds.maxY - selectionBounds.minY,
                1,
              ) * 1.6
            : distance;
        if (view === "top") camera.position.set(target.x, target.z + distance, -target.y);
        else
          camera.position.set(
            selectedTarget.x + selectedDistance,
            selectedTarget.z + selectedDistance * 0.75,
            -selectedTarget.y + selectedDistance,
          );
        camera.up.set(0, 0, view === "top" ? -1 : 0);
        if (view !== "top") camera.up.set(0, 1, 0);
        controls.target.set(selectedTarget.x, selectedTarget.z, -selectedTarget.y);
        controls.update();
        render();
      };
      applyCamera();
      const resize = () => {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer!.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
      };
      const lost: EventListener = (event) => {
        event.preventDefault();
        stopped = true;
        if (frame) cancelAnimationFrame(frame);
        setMessage(
          "WebGL context was lost. Rendering stopped; the complete 2D and textual evidence remains available.",
        );
      };
      renderer.domElement.addEventListener("webglcontextlost", lost);
      listeners.push([renderer.domElement, "webglcontextlost", lost]);
      window.addEventListener("resize", resize);
      listeners.push([window, "resize", resize]);
      resize();
      frame = requestAnimationFrame(render);
      setMessage(
        "Technical 3D scene ready. Geometry is authoritative; display scale does not affect calculation.",
      );
    } catch {
      setMessage("WebGL is unavailable. Use the complete 2D review and textual findings below.");
    }
    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      listeners.forEach(([target, type, listener]) => target.removeEventListener(type, listener));
      disposables.reverse().forEach((item) => item.dispose());
      scene.clear();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }
      renderer = undefined;
    };
  }, [data, findings, layers, selectedId, view]);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {(["top", "isometric", "fit-site", "fit-selection", "initial"] as const).map((next) => (
          <button
            key={next}
            className="rounded border px-2 py-1 focus-visible:ring-2"
            onClick={() => setView(next)}
          >
            {next === "initial"
              ? "Reset view"
              : next === "top"
                ? "Top view"
                : next === "isometric"
                  ? "Isometric view"
                  : next === "fit-site"
                    ? "Fit site"
                    : "Fit selection"}
          </button>
        ))}
        <label className="rounded border px-2 py-1">
          Selected authoritative object
          <select
            className="ml-2 bg-background"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">none</option>
            {[...(data?.tables ?? []), ...(data?.obstructions ?? []), ...(data?.shadows ?? [])].map(
              (item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ),
            )}
          </select>
        </label>
        {Object.entries(layers).map(([name, enabled]) => (
          <label key={name} className="rounded border px-2 py-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) =>
                setLayers((current) => ({ ...current, [name]: event.target.checked }))
              }
            />{" "}
            {name}
          </label>
        ))}
      </div>
      <div ref={host} className="mt-3 h-96 w-full overflow-hidden rounded-xl border" />
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
      <p className="text-sm">
        Orbit, pan, and zoom use pointer controls. Project north is the top-view orientation.
        Renderer lighting or shadows are not engineering results.
      </p>
    </div>
  );
}
