import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  TERRAIN_3D_LIMITS,
  applyVisualExaggeration,
  createTerrainDisplayGeometry,
  sampleOverlayIndices,
  validateTerrainFor3D,
  type Terrain3DLayer,
} from "../../../../shared/renewableEnergy/terrain/terrain3dCore";
import type {
  TerrainAnalysis,
  TerrainParseResult,
} from "../../../../shared/renewableEnergy/terrain/terrainTypes";

type RendererStatus = "loading" | "ready" | "unavailable" | "context-lost" | "failed";
const buttonClass =
  "rounded-lg border border-glass-border bg-card px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
type Resources = {
  renderer: THREE.WebGLRenderer;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshLambertMaterial;
  contourGeometry: THREE.BufferGeometry;
  contourMaterial: THREE.LineBasicMaterial;
  pointGeometry: THREE.BufferGeometry;
  pointMaterial: THREE.PointsMaterial;
  screenedGeometry: THREE.BufferGeometry;
  screenedMaterial: THREE.PointsMaterial;
  mesh: THREE.Mesh;
  contours: THREE.LineSegments;
  points: THREE.Points;
  screened: THREE.Points;
  controls: OrbitControls;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
};

export function Terrain3DReview({
  analysis,
  parsed,
  coordinateType,
}: {
  analysis: TerrainAnalysis;
  parsed: TerrainParseResult;
  coordinateType: "local" | "projected";
}) {
  const validation = useMemo(
    () => validateTerrainFor3D(analysis, parsed, coordinateType),
    [analysis, coordinateType, parsed],
  );
  if (!validation.valid) {
    return (
      <section
        role="alert"
        className="rounded-2xl border border-warning/30 bg-warning/10 p-5 text-sm"
      >
        <h2 className="text-xl font-semibold">Terrain 3D Review unavailable</h2>
        <p className="mt-2">
          The terrain result cannot be rendered safely: {validation.message} The verified 2D review
          and source result remain available.
        </p>
      </section>
    );
  }
  return <Terrain3DRenderer analysis={analysis} parsed={parsed} coordinateType={coordinateType} />;
}

function Terrain3DRenderer({
  analysis,
  parsed,
  coordinateType,
}: {
  analysis: TerrainAnalysis;
  parsed: TerrainParseResult;
  coordinateType: "local" | "projected";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resources = useRef<Resources | null>(null);
  const frame = useRef<number | null>(null);
  const [status, setStatus] = useState<RendererStatus>("loading");
  const [layer, setLayer] = useState<Terrain3DLayer>("elevation");
  const [wireframe, setWireframe] = useState(false);
  const [showContours, setShowContours] = useState(true);
  const [showPoints, setShowPoints] = useState(false);
  const [showScreened, setShowScreened] = useState(true);
  const [exaggeration, setExaggeration] = useState(1);
  const [cameraMode, setCameraMode] = useState<"perspective" | "top">("perspective");
  const [selected, setSelected] = useState<{
    x: number;
    y: number;
    elevation: number;
  } | null>(null);
  const exaggerationRef = useRef(exaggeration);
  const statusRef = useRef<RendererStatus>(status);
  useEffect(() => {
    exaggerationRef.current = exaggeration;
  }, [exaggeration]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const display = useMemo(
    () => createTerrainDisplayGeometry(analysis, parsed, coordinateType),
    [analysis, coordinateType, parsed],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setStatus("loading");
    let active = true;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "Interactive three-dimensional terrain review");
    canvas.tabIndex = 0;
    container.append(canvas);
    try {
      const context =
        canvas.getContext("webgl2", { antialias: true, alpha: false }) ??
        canvas.getContext("webgl", { antialias: true, alpha: false });
      if (!context) {
        setStatus("unavailable");
        canvas.remove();
        return;
      }
      const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, TERRAIN_3D_LIMITS.maxDevicePixelRatio),
      );
      renderer.setClearColor(new THREE.Color("#0b1020"), 1);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1_000_000);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(display.positions.slice(), 3));
      geometry.setIndex(new THREE.BufferAttribute(display.indices, 1));
      geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(createColors(display, analysis, "elevation"), 3),
      );
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.8));
      const directional = new THREE.DirectionalLight(0xffffff, 1.4);
      directional.position.set(1, 2, 1);
      scene.add(directional);

      const contourGeometry = createContourGeometry(analysis, display);
      const contourMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.65,
        transparent: true,
      });
      const contours = new THREE.LineSegments(contourGeometry, contourMaterial);
      scene.add(contours);
      const pointGeometry = createPointGeometry(parsed, display, false);
      const pointMaterial = new THREE.PointsMaterial({
        color: 0xe2e8f0,
        size: 2,
        sizeAttenuation: false,
      });
      const points = new THREE.Points(pointGeometry, pointMaterial);
      points.visible = false;
      scene.add(points);
      const screenedGeometry = createPointGeometry(parsed, display, true, analysis);
      const screenedMaterial = new THREE.PointsMaterial({
        color: 0xf97316,
        size: 5,
        sizeAttenuation: false,
      });
      const screened = new THREE.Points(screenedGeometry, screenedMaterial);
      scene.add(screened);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.screenSpacePanning = true;
      controls.minDistance = 1;
      controls.maxDistance =
        Math.max(
          display.bounds.maxX - display.bounds.minX,
          display.bounds.maxY - display.bounds.minY,
        ) *
          20 +
        100;
      const fit = () => fitCamera(camera, controls, display, "perspective");
      fit();
      const resize = () => {
        const width = Math.max(container.clientWidth, 280);
        const height = Math.max(container.clientHeight, 360);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();
      const onLost = (event: Event) => {
        event.preventDefault();
        if (active) setStatus("context-lost");
      };
      const onRestored = () => {
        if (active) setStatus("ready");
      };
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const onSelect = (event: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (!hit) return;
        setSelected({
          x: hit.point.x,
          y: -hit.point.z,
          elevation: hit.point.y / exaggerationRef.current,
        });
      };
      canvas.addEventListener("dblclick", onSelect);
      const render = () => {
        if (!active) return;
        if (!document.hidden && statusRef.current !== "context-lost") {
          controls.update();
          renderer.render(scene, camera);
        }
        frame.current = requestAnimationFrame(render);
      };
      resources.current = {
        renderer,
        geometry,
        material,
        contourGeometry,
        contourMaterial,
        pointGeometry,
        pointMaterial,
        screenedGeometry,
        screenedMaterial,
        mesh,
        contours,
        points,
        screened,
        controls,
        camera,
        scene,
      };
      frame.current = requestAnimationFrame(render);
      setStatus("ready");
      return () => {
        active = false;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        observer.disconnect();
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        canvas.removeEventListener("dblclick", onSelect);
        controls.dispose();
        geometry.dispose();
        material.dispose();
        contourGeometry.dispose();
        contourMaterial.dispose();
        pointGeometry.dispose();
        pointMaterial.dispose();
        screenedGeometry.dispose();
        screenedMaterial.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        resources.current = null;
      };
    } catch {
      setStatus("failed");
      canvas.remove();
    }
  }, [analysis, display, parsed]);

  useEffect(() => {
    const current = resources.current;
    if (!current) return;
    current.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(applyVisualExaggeration(display.positions, exaggeration), 3),
    );
    current.geometry.computeVertexNormals();
    current.contours.scale.y = exaggeration;
    current.points.scale.y = exaggeration;
    current.screened.scale.y = exaggeration;
  }, [display.positions, exaggeration]);
  useEffect(() => {
    const current = resources.current;
    if (!current) return;
    current.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(createColors(display, analysis, layer), 3),
    );
  }, [analysis, display, layer]);
  useEffect(() => {
    if (resources.current) resources.current.material.wireframe = wireframe;
  }, [wireframe]);
  useEffect(() => {
    if (resources.current) resources.current.contours.visible = showContours;
  }, [showContours]);
  useEffect(() => {
    if (resources.current) resources.current.points.visible = showPoints;
  }, [showPoints]);
  useEffect(() => {
    if (resources.current) resources.current.screened.visible = showScreened;
  }, [showScreened]);

  const setView = (mode: "perspective" | "top") => {
    const current = resources.current;
    if (!current) return;
    setCameraMode(mode);
    fitCamera(current.camera, current.controls, display, mode);
  };
  const zoom = (factor: number) => {
    const current = resources.current;
    if (!current) return;
    const offset = current.camera.position
      .clone()
      .sub(current.controls.target)
      .multiplyScalar(factor);
    current.camera.position.copy(current.controls.target).add(offset);
    current.camera.updateProjectionMatrix();
  };
  const fallback = status === "unavailable" || status === "failed";
  return (
    <section
      aria-labelledby="terrain-3d-title"
      className="rounded-2xl border border-glass-border bg-card/50 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="terrain-3d-title" className="text-2xl font-semibold">
            Terrain 3D Review
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Orbit with primary drag, pan with secondary drag, zoom with the wheel, or use the
            keyboard-operable controls. Display settings never alter engineering data.
          </p>
        </div>
        <p aria-live="polite" className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
          Renderer: {status.replace("-", " ")}
        </p>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Terrain layer
            <select
              value={layer}
              onChange={(event) => setLayer(event.target.value as Terrain3DLayer)}
              className="mt-1 w-full rounded-lg border border-glass-border bg-background px-3 py-2"
            >
              <option value="elevation">Elevation (metres)</option>
              <option value="slope">Slope (degrees)</option>
              <option value="aspect">Aspect (clockwise from north)</option>
              <option value="buildability">Preliminary slope screening</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Visual elevation exaggeration: {exaggeration.toFixed(2)}×
            <input
              type="range"
              min={TERRAIN_3D_LIMITS.minExaggeration}
              max={TERRAIN_3D_LIMITS.maxExaggeration}
              step="0.25"
              value={exaggeration}
              onChange={(event) => setExaggeration(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Visual only. Source elevations, statistics, slope, aspect, and exports remain unchanged.
          </p>
          {[
            ["Wireframe", wireframe, setWireframe],
            ["Contours", showContours, setShowContours],
            ["Source points", showPoints, setShowPoints],
            ["Screened or excluded points", showScreened, setShowScreened],
          ].map(([label, checked, setter]) => (
            <label key={String(label)} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(checked)}
                onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
              />
              {String(label)}
            </label>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button className={buttonClass} onClick={() => zoom(0.8)} aria-label="Zoom terrain in">
              Zoom in
            </button>
            <button
              className={buttonClass}
              onClick={() => zoom(1.25)}
              aria-label="Zoom terrain out"
            >
              Zoom out
            </button>
            <button className={buttonClass} onClick={() => setView("perspective")}>
              Isometric view
            </button>
            <button className={buttonClass} onClick={() => setView("top")}>
              Top view
            </button>
            <button className={buttonClass} onClick={() => setView(cameraMode)}>
              Fit terrain
            </button>
            <button
              className={buttonClass}
              onClick={() => {
                setExaggeration(1);
                setView("perspective");
              }}
            >
              Reset view
            </button>
          </div>
          <dl className="rounded-xl bg-background/60 p-4 text-sm">
            <dt className="font-semibold">Current review state</dt>
            <dd className="mt-2">Layer: {layer}</dd>
            <dd>Camera: {cameraMode}</dd>
            <dd>Exaggeration: {exaggeration.toFixed(2)}× visual only</dd>
            <dd>Display triangles: {display.indices.length / 3}</dd>
            <dd>Engineering triangles: {analysis.mesh.triangles.length}</dd>
            <dd>North: positive project Y</dd>
          </dl>
          <p className="rounded-xl bg-background/60 p-4 text-xs text-muted-foreground">
            Legend: elevation runs low-to-high from blue through green; slope runs gentle-to-steep
            from green through red; aspect uses direction around the colour wheel; buildability is
            green preferred, amber review required, red slope-excluded, and grey no data.
          </p>
          {selected && (
            <dl className="rounded-xl bg-background/60 p-4 text-sm">
              <dt className="font-semibold">Selected terrain location</dt>
              <dd className="mt-2">Local X: {selected.x.toFixed(2)} m</dd>
              <dd>Local Y: {selected.y.toFixed(2)} m</dd>
              <dd>Elevation: {selected.elevation.toFixed(2)} m</dd>
            </dl>
          )}
        </div>
        <div>
          <div
            ref={containerRef}
            role="img"
            aria-label="Interactive 3D terrain surface with equivalent statistics and controls alongside"
            className="relative min-h-[440px] overflow-hidden rounded-xl border border-glass-border bg-[#0b1020] [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full"
          />
          {fallback && (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm"
            >
              3D rendering is unavailable in this browser. The verified terrain result, 2D review,
              statistics, and DraflioScene download remain available.
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Extent: {(display.bounds.maxX - display.bounds.minX).toFixed(2)} m ×{" "}
            {(display.bounds.maxY - display.bounds.minY).toFixed(2)} m. Elevation range:{" "}
            {display.bounds.minZ.toFixed(2)}–{display.bounds.maxZ.toFixed(2)} m. Orange points are
            screening findings and require review. No-data gaps show the dark canvas background.
          </p>
        </div>
      </div>
    </section>
  );
}

function fitCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  display: ReturnType<typeof createTerrainDisplayGeometry>,
  mode: "perspective" | "top",
) {
  const width = Math.max(display.bounds.maxX - display.bounds.minX, 1);
  const depth = Math.max(display.bounds.maxY - display.bounds.minY, 1);
  const height = Math.max(display.bounds.maxZ - display.bounds.minZ, 1);
  const distance = Math.max(width, depth, height) * 1.8;
  controls.target.set(0, (display.bounds.minZ + display.bounds.maxZ) / 2, 0);
  camera.position.set(
    mode === "top" ? 0 : distance,
    mode === "top" ? distance : distance * 0.8,
    mode === "top" ? 0.001 : distance,
  );
  camera.near = Math.max(distance / 10_000, 0.01);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

function createColors(
  display: ReturnType<typeof createTerrainDisplayGeometry>,
  analysis: TerrainAnalysis,
  layer: Terrain3DLayer,
) {
  const colors = new Float32Array(display.sourceVertexIndices.length * 3);
  const range = Math.max(display.bounds.maxZ - display.bounds.minZ, 1e-9);
  display.sourceVertexIndices.forEach((sourceIndex, displayIndex) => {
    const vertex = analysis.mesh.vertices[sourceIndex];
    const column = Math.round((vertex.x - analysis.grid.originX) / analysis.grid.spacing);
    const row = Math.round((vertex.y - analysis.grid.originY) / analysis.grid.spacing);
    const cell = row * analysis.grid.columns + column;
    const color = new THREE.Color();
    if (layer === "elevation")
      color.setHSL(0.62 - ((vertex.z - display.bounds.minZ) / range) * 0.5, 0.7, 0.5);
    else if (layer === "slope")
      color.setHSL(0.33 - Math.min(analysis.slopes[cell] ?? 0, 30) / 90, 0.75, 0.5);
    else if (layer === "aspect")
      color.setHSL(
        (analysis.aspects[cell] ?? 0) / 360,
        0.7,
        analysis.aspects[cell] === null ? 0.55 : 0.5,
      );
    else {
      const category = analysis.buildability[cell];
      color.set(
        category === "preferred"
          ? "#22c55e"
          : category === "review-required"
            ? "#eab308"
            : category === "excluded-by-slope"
              ? "#ef4444"
              : "#64748b",
      );
    }
    color.toArray(colors, displayIndex * 3);
  });
  return colors;
}

function createContourGeometry(
  analysis: TerrainAnalysis,
  display: ReturnType<typeof createTerrainDisplayGeometry>,
) {
  const segments = analysis.contours
    .flatMap((contour) =>
      contour.segments.map((segment) => ({ segment, elevation: contour.elevation })),
    )
    .slice(0, TERRAIN_3D_LIMITS.maxContourSegments);
  const positions = new Float32Array(segments.length * 6);
  const centerX = (display.bounds.minX + display.bounds.maxX) / 2;
  const centerY = (display.bounds.minY + display.bounds.maxY) / 2;
  segments.forEach(({ segment, elevation }, index) => {
    positions.set(
      [
        segment[0][0] - centerX,
        elevation + 0.03,
        -(segment[0][1] - centerY),
        segment[1][0] - centerX,
        elevation + 0.03,
        -(segment[1][1] - centerY),
      ],
      index * 6,
    );
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function createPointGeometry(
  parsed: TerrainParseResult,
  display: ReturnType<typeof createTerrainDisplayGeometry>,
  screenedOnly: boolean,
  analysis?: TerrainAnalysis,
) {
  const screened = new Set([
    ...(analysis?.quality.spikePointIndices ?? []),
    ...(analysis?.quality.isolatedPointIndices ?? []),
    ...(analysis?.quality.coordinateOutlierIndices ?? []),
  ]);
  const candidates = screenedOnly
    ? [...screened]
    : sampleOverlayIndices(parsed.points.length, TERRAIN_3D_LIMITS.maxSourcePoints);
  const selected = candidates.slice(0, TERRAIN_3D_LIMITS.maxSourcePoints);
  const centerX = (display.bounds.minX + display.bounds.maxX) / 2;
  const centerY = (display.bounds.minY + display.bounds.maxY) / 2;
  const positions = new Float32Array(selected.length * 3);
  selected.forEach((pointIndex, index) => {
    const point = parsed.points[pointIndex];
    if (!point) return;
    positions.set([point.x - centerX, point.z + 0.05, -(point.y - centerY)], index * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}
