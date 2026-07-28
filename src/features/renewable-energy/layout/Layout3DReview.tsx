import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  ArrayArea,
  ExclusionZone,
  GeneratedTable,
  Polygon2,
  TerrainSampler,
} from "../../../../shared/renewableEnergy/layout/layoutTypes";
import { LAYOUT_LIMITS } from "../../../../shared/renewableEnergy/layout/layoutTypes";
import type { DraflioScene } from "../../../../shared/renewableEnergy/draflioSceneTypes";
import { applyRegistrationToPoint } from "../../../../shared/renewableEnergy/layout/layoutCore";
import type { RegistrationResult } from "../../../../shared/renewableEnergy/layout/layoutTypes";

export function Layout3DReview({
  tables,
  boundary,
  terrainScene,
  drawingScene,
  selectedId,
  registration,
  exclusions,
  areas,
  terrainSampler,
}: {
  tables: readonly GeneratedTable[];
  boundary?: Polygon2;
  terrainScene?: Readonly<DraflioScene>;
  drawingScene?: Readonly<DraflioScene>;
  selectedId?: string;
  registration?: RegistrationResult;
  exclusions: readonly ExclusionZone[];
  areas: readonly ArrayArea[];
  terrainSampler?: TerrainSampler;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const terrainTriangleCount =
    terrainScene?.objects.find((object) => object.kind === "terrain-surface")?.geometry.triangles
      .length ?? 0;
  const terrainDisplayLimited = terrainTriangleCount > LAYOUT_LIMITS.maxDisplayTriangles;
  const [layers, setLayers] = useState({
    terrain: true,
    drawing: true,
    boundary: true,
    exclusions: true,
    areas: true,
    tables: true,
  });
  const [command, setCommand] = useState<"top" | "iso" | "fit" | "selection" | "reset">("reset");
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFallback("WebGL is unavailable. The complete 2D engineering review remains available.");
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101820);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100_000);
    camera.position.set(40, -40, 40);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const group = new THREE.Group();
    scene.add(group);
    const line = (polygon: Polygon2, color: number, name?: string, elevations?: boolean) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        polygon.vertices.map(
          (point) =>
            new THREE.Vector3(
              point.x,
              point.y,
              elevations ? (terrainSampler?.(point).elevation ?? 0) : 0,
            ),
        ),
      );
      const material = new THREE.LineBasicMaterial({ color });
      geometries.push(geometry);
      materials.push(material);
      const object = new THREE.Line(geometry, material);
      if (name) object.name = name;
      group.add(object);
    };
    const terrain = terrainScene?.objects.find((object) => object.kind === "terrain-surface");
    if (terrain && layers.terrain && !terrainDisplayLimited) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          terrain.geometry.vertices.flatMap((vertex) => [vertex.x, vertex.y, vertex.z]),
          3,
        ),
      );
      geometry.setIndex(terrain.geometry.triangles.flat());
      geometry.computeVertexNormals();
      const material = new THREE.MeshNormalMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      });
      geometries.push(geometry);
      materials.push(material);
      group.add(new THREE.Mesh(geometry, material));
    }
    if (layers.drawing)
      drawingScene?.objects.forEach((object) => {
        if (object.kind !== "annotation" || object.geometry.type !== "polyline") return;
        line(
          {
            vertices: object.geometry.points.map((point) =>
              registration
                ? applyRegistrationToPoint({ x: point.x, y: point.y }, registration)
                : { x: point.x, y: point.y },
            ),
          },
          0x60a5fa,
        );
      });
    if (boundary && layers.boundary) line(boundary, 0xf5d76e);
    if (layers.exclusions)
      exclusions.forEach((zone) => line(zone.effectiveGeometry, 0xef4444, zone.id, true));
    if (layers.areas)
      areas.forEach((area) =>
        area.effectivePlacementRegions.forEach((region, index) =>
          line(region, 0x3b82f6, `${area.id}-region-${index}`, true),
        ),
      );
    if (layers.tables)
      tables.forEach((table) =>
        line(
          table.footprint,
          table.id === selectedId
            ? 0xfacc15
            : table.reviewStatus === "excluded"
              ? 0x999999
              : table.findings.some((finding) => finding.status === "fail")
                ? 0xef4444
                : table.reviewStatus === "reviewed" ||
                    table.reviewStatus === "approved-for-preliminary-draflio-workflow"
                  ? 0x22c55e
                  : 0xf97316,
          table.id,
          true,
        ),
      );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    let frame = 0;
    let lost = false;
    const resize = () => {
      const width = Math.max(element.clientWidth, 1);
      const height = Math.max(element.clientHeight, 320);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const fit = (target: THREE.Object3D = group) => {
      const box = new THREE.Box3().setFromObject(target);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      controls.target.copy(center);
      camera.position.set(center.x + size, center.y - size, center.z + Math.max(size, 10));
      camera.updateProjectionMatrix();
      controls.update();
    };
    if (command === "top") {
      fit();
      camera.position.set(controls.target.x, controls.target.y, controls.target.z + 100);
      camera.up.set(0, 1, 0);
      camera.lookAt(controls.target);
    } else if (command === "selection") {
      const selected = group.getObjectByName(selectedId ?? "");
      fit(selected ?? group);
    } else if (command === "iso" || command === "fit") fit();
    else {
      camera.position.set(40, -40, 40);
      controls.target.set(0, 0, 0);
    }
    resize();
    const animate = () => {
      if (lost) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
      setFallback("WebGL context was lost safely. Continue in the complete 2D review.");
    };
    const onRestored = () => {
      lost = false;
      setFallback(null);
      animate();
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);
    window.addEventListener("resize", resize);
    animate();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
      controls.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [
    tables,
    boundary,
    terrainScene,
    drawingScene,
    registration,
    exclusions,
    areas,
    terrainSampler,
    layers,
    selectedId,
    command,
    terrainDisplayLimited,
  ]);
  return (
    <section className="rounded-2xl border border-glass-border bg-card/50 p-5">
      <h2 className="text-2xl font-semibold">3D review studio</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Actual declared table envelopes only. No structures, piles, textures, shading, or imagery
        are invented.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["top", "iso", "fit", "selection", "reset"] as const).map((name) => (
          <button
            key={name}
            className="rounded-lg border px-3 py-2 text-sm focus-visible:ring-2"
            onClick={() => setCommand(name)}
          >
            {name === "iso"
              ? "Isometric view"
              : name === "selection"
                ? "Fit selection"
                : `${name[0].toUpperCase()}${name.slice(1)} view`}
          </button>
        ))}
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-3">
        <legend className="font-semibold">3D layers</legend>
        {Object.entries(layers).map(([name, visible]) => (
          <label key={name} className="rounded-lg border p-2 text-sm">
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) =>
                setLayers((current) => ({ ...current, [name]: event.target.checked }))
              }
            />{" "}
            {name}
          </label>
        ))}
      </fieldset>
      <p className="mt-2 text-sm">
        Layer identity: terrain; registered drawing; gold boundary; red exclusions; blue array
        areas. Table review states and selected findings are identified in text outside WebGL.
      </p>
      {fallback && (
        <p role="status" className="mt-3 rounded-lg bg-warning/10 p-3">
          {fallback}
        </p>
      )}
      {terrainDisplayLimited && (
        <p role="status" className="mt-3 rounded-lg bg-warning/10 p-3">
          The terrain contains {terrainTriangleCount.toLocaleString()} triangles, above the bounded
          3D display limit of {LAYOUT_LIMITS.maxDisplayTriangles.toLocaleString()}. Terrain is
          hidden in 3D; the complete 2D engineering review remains available.
        </p>
      )}
      <div
        ref={host}
        aria-label="Interactive 3D terrain-aware layout review"
        className="mt-3 min-h-80 overflow-hidden rounded-xl"
      />
    </section>
  );
}
