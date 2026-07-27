import { useEffect, useRef, useState } from "react";
import { serializeDraflioScene } from "../../../../shared/renewableEnergy/draflioSceneSerialization";
import { detectTerrainSample } from "../../../../shared/renewableEnergy/terrain/terrainParsing";
import { terrainToDraflioScene } from "../../../../shared/renewableEnergy/terrain/terrainSceneConversion";
import {
  TERRAIN_LIMITS,
  type TerrainAnalysis,
  type TerrainConfig,
  type TerrainDelimiter,
  type TerrainImportOptions,
  type TerrainParseResult,
  type TerrainProgressStage,
  type TerrainSample,
} from "../../../../shared/renewableEnergy/terrain/terrainTypes";
import { Breadcrumbs, RenewablePage, StatusBadge } from "../RenewableShell";
import { safeTerrainFilename, validateTerrainFile } from "./terrainFileClient";

const buttonClass =
  "rounded-xl border border-glass-border bg-card px-4 py-2 text-sm font-semibold transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full rounded-lg border border-glass-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const defaults: TerrainConfig = {
  gridSpacing: 5,
  idwPower: 2,
  searchRadius: 30,
  minNeighbours: 3,
  maxNeighbours: 12,
  contourInterval: 5,
  preferredSlope: 8,
  reviewSlope: 15,
};

export function TerrainWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [sample, setSample] = useState<TerrainSample | null>(null);
  const [delimiter, setDelimiter] = useState<TerrainDelimiter>("comma");
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState({ x: 0, y: 1, z: 2 });
  const [unit, setUnit] = useState<"m" | "ft">("m");
  const [coordinateType, setCoordinateType] = useState<"local" | "projected" | "geographic">(
    "local",
  );
  const [epsg, setEpsg] = useState("");
  const [coordinateName, setCoordinateName] = useState("");
  const [conflictResolution, setConflictResolution] =
    useState<TerrainImportOptions["conflictResolution"]>("reject");
  const [config, setConfig] = useState(defaults);
  const [stage, setStage] = useState<TerrainProgressStage | "awaiting-column-mapping" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    parsed: TerrainParseResult;
    analysis: TerrainAnalysis;
  } | null>(null);
  const [layer, setLayer] = useState<"elevation" | "slope" | "aspect" | "buildability">(
    "elevation",
  );
  const [showPoints, setShowPoints] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [excludedSourceIndices, setExcludedSourceIndices] = useState<Set<number>>(new Set());
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const downloadUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      worker.current?.terminate();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );

  const chooseFile = async (selected: File) => {
    cancel(false);
    const readGeneration = generation.current;
    const check = validateTerrainFile(selected);
    if (!check.valid) return setError(check.message);
    try {
      const content = await readTerrainFile(selected);
      if (readGeneration !== generation.current) return;
      if (content.includes("\0")) throw new Error("The selected file contains binary data.");
      const detected = detectTerrainSample(content);
      setFile(selected);
      setText(content);
      setSample(detected);
      setDelimiter(detected.delimiter);
      setHasHeader(detected.hasHeader);
      setMapping({ x: 0, y: 1, z: 2 });
      setStage("awaiting-column-mapping");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terrain file could not be sampled.");
    }
  };
  const options = (): TerrainImportOptions => ({
    delimiter,
    hasHeader,
    mapping,
    unit,
    coordinateSystem: {
      type: coordinateType,
      epsgCode: coordinateType === "projected" && epsg ? Number(epsg) : undefined,
      name: coordinateName.trim() || undefined,
    },
    conflictResolution,
  });
  const process = (exclusions: Set<number> = excludedSourceIndices) => {
    if (!file || !sample || coordinateType === "geographic") return;
    if (new Set([mapping.x, mapping.y, mapping.z]).size !== 3) {
      setError("X, Y, and Z columns must be different.");
      return;
    }
    if (
      coordinateType === "projected" &&
      epsg &&
      (!Number.isInteger(Number(epsg)) || Number(epsg) <= 0)
    ) {
      setError("EPSG code must be a positive integer when supplied.");
      return;
    }
    const current = ++generation.current;
    setResult(null);
    setError(null);
    setStage("parsing");
    const active = new Worker(new URL("./terrainWorker.ts", import.meta.url), { type: "module" });
    worker.current = active;
    active.onmessage = (
      event: MessageEvent<
        | { type: "progress"; generation: number; stage: TerrainProgressStage }
        | {
            type: "result";
            generation: number;
            parsed: TerrainParseResult;
            analysis: TerrainAnalysis;
          }
        | { type: "error"; generation: number; message: string }
      >,
    ) => {
      if (event.data.generation !== generation.current) return;
      if (event.data.type === "progress") setStage(event.data.stage);
      else if (event.data.type === "result") {
        setResult({ parsed: event.data.parsed, analysis: event.data.analysis });
        setStage("ready");
        active.terminate();
        if (worker.current === active) worker.current = null;
      } else {
        setError(event.data.message);
        setStage("failed");
        active.terminate();
        if (worker.current === active) worker.current = null;
      }
    };
    active.onerror = () => {
      if (current === generation.current) {
        setError("Terrain worker failed safely.");
        setStage("failed");
      }
      active.terminate();
    };
    active.postMessage({
      type: "process",
      generation: current,
      text,
      options: options(),
      config,
      excludedSourceIndices: [...exclusions],
    });
  };
  const cancel = (showCancelled = true) => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    setResult(null);
    if (showCancelled) {
      setStage("cancelled");
      setError(null);
    }
  };
  const startOver = () => {
    cancel(false);
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = null;
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setText("");
    setSample(null);
    setStage(null);
    setError(null);
    setResult(null);
    setConfig(defaults);
    setSelectedCell(null);
    setExcludedSourceIndices(new Set());
    setZoom(1);
  };
  const download = async () => {
    if (!result || !file || downloadUrl.current) return;
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const sha256 = [...new Uint8Array(hash)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const scene = terrainToDraflioScene({
      sourceName: file.name,
      sourceMediaType: file.type || "text/plain",
      sourceHash: sha256,
      sourceType: file.name.toLowerCase().endsWith(".xyz") ? "xyz" : "csv",
      importedAt: new Date(file.lastModified || Date.now()).toISOString(),
      parsed: result.parsed,
      analysis: result.analysis,
      options: options(),
    });
    const url = URL.createObjectURL(
      new Blob([serializeDraflioScene(scene)], { type: "application/json;charset=utf-8" }),
    );
    downloadUrl.current = url;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeTerrainFilename(file.name);
    anchor.click();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        URL.revokeObjectURL(url);
        if (downloadUrl.current === url) downloadUrl.current = null;
      }),
    );
  };
  const processing =
    stage !== null && !["ready", "failed", "cancelled", "awaiting-column-mapping"].includes(stage);

  return (
    <RenewablePage>
      <section className="border-b border-glass-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Renewable Energy", to: "/renewable-energy" },
              { label: "Solar PV", to: "/renewable-energy/solar" },
              { label: "Terrain Intelligence" },
            ]}
          />
          <div className="mt-7">
            <StatusBadge>Computational preview active</StatusBadge>
          </div>
          <h1 className="mt-5 text-4xl font-bold gradient-text sm:text-5xl">
            Terrain Intelligence
          </h1>
          <p className="mt-5 max-w-5xl leading-7 text-muted-foreground">
            Terrain point processing, mesh construction, contours, slope, aspect, and 2D review are
            active. GeoTIFF import, CAD import, satellite maps, 3D rendering, grading, drainage, and
            terrain-aware PV layout are not active yet.
          </p>
        </div>
      </section>
      <section className="py-10">
        <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const selected = event.dataTransfer.files[0];
              if (selected) void chooseFile(selected);
            }}
            className="rounded-2xl border border-dashed border-primary/40 bg-card/40 p-6"
          >
            <h2 className="text-xl font-semibold">1. Import terrain points</h2>
            <label htmlFor="terrain-file" className="mt-3 block text-sm font-medium">
              CSV, TXT, or XYZ point file
            </label>
            <input
              ref={inputRef}
              id="terrain-file"
              type="file"
              accept=".csv,.txt,.xyz,text/csv,text/plain"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void chooseFile(selected);
              }}
              className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              One browser-local point file, maximum 25 MB and 250,000 accepted points. Drop is also
              supported.
            </p>
          </div>
          {sample && (
            <>
              <section
                aria-labelledby="mapping-title"
                className="rounded-2xl border border-glass-border bg-card/50 p-6"
              >
                <h2 id="mapping-title" className="text-xl font-semibold">
                  2. Review columns and coordinates
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Select
                    label="Delimiter"
                    value={delimiter}
                    set={(value) => setDelimiter(value as TerrainDelimiter)}
                    options={[
                      ["comma", "Comma"],
                      ["semicolon", "Semicolon"],
                      ["tab", "Tab"],
                      ["whitespace", "Whitespace"],
                    ]}
                  />
                  <Select
                    label="Header row"
                    value={hasHeader ? "yes" : "no"}
                    set={(value) => setHasHeader(value === "yes")}
                    options={[
                      ["yes", "Present"],
                      ["no", "Not present"],
                    ]}
                  />
                  {(["x", "y", "z"] as const).map((axis) => (
                    <Select
                      key={axis}
                      label={`${axis.toUpperCase()} column`}
                      value={String(mapping[axis])}
                      set={(value) =>
                        setMapping((current) => ({ ...current, [axis]: Number(value) }))
                      }
                      options={sample.columns.map((column, index) => [String(index), column])}
                    />
                  ))}
                  <Select
                    label="Input length unit"
                    value={unit}
                    set={(value) => setUnit(value as "m" | "ft")}
                    options={[
                      ["m", "Metres"],
                      ["ft", "Feet (converted to metres)"],
                    ]}
                  />
                  <Select
                    label="Coordinate system"
                    value={coordinateType}
                    set={(value) => setCoordinateType(value as typeof coordinateType)}
                    options={[
                      ["local", "Local"],
                      ["projected", "Projected"],
                      ["geographic", "Geographic"],
                    ]}
                  />
                  {coordinateType === "projected" && (
                    <>
                      <Field label="Optional EPSG code" value={epsg} set={setEpsg} type="number" />
                      <Field
                        label="Coordinate-system name"
                        value={coordinateName}
                        set={setCoordinateName}
                      />
                    </>
                  )}
                  <Select
                    label="Conflicting XY elevations"
                    value={conflictResolution}
                    set={(value) =>
                      setConflictResolution(value as TerrainImportOptions["conflictResolution"])
                    }
                    options={[
                      ["reject", "Reject conflicts"],
                      ["first", "Retain first"],
                      ["last", "Retain last"],
                      ["average", "Average elevations"],
                    ]}
                  />
                </div>
                {coordinateType === "geographic" && (
                  <p
                    role="alert"
                    className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm"
                  >
                    Longitude and latitude may be inspected, but metre-based interpolation, mesh,
                    contours, slope, and buildability are blocked. Select an appropriate projected
                    coordinate system without inventing a projection.
                  </p>
                )}
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-xs">
                    <caption className="mb-2 text-left font-semibold">
                      Bounded source preview
                    </caption>
                    <tbody>
                      {sample.rows.slice(0, 8).map((row, index) => (
                        <tr key={index} className="border-t border-glass-border">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="max-w-48 truncate px-3 py-2">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="rounded-2xl border border-glass-border bg-card/50 p-6">
                <h2 className="text-xl font-semibold">3. Processing configuration</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <NumberField
                    label="Grid spacing (m)"
                    value={config.gridSpacing}
                    min={0.01}
                    max={10000}
                    set={(value) => setConfig((c) => ({ ...c, gridSpacing: value }))}
                  />
                  <NumberField
                    label="IDW power"
                    value={config.idwPower}
                    min={1}
                    max={4}
                    set={(value) => setConfig((c) => ({ ...c, idwPower: value }))}
                  />
                  <NumberField
                    label="Search radius (m)"
                    value={config.searchRadius}
                    min={0.01}
                    max={100000}
                    set={(value) => setConfig((c) => ({ ...c, searchRadius: value }))}
                  />
                  <NumberField
                    label="Contour interval (m)"
                    value={config.contourInterval}
                    min={0.01}
                    max={10000}
                    set={(value) => setConfig((c) => ({ ...c, contourInterval: value }))}
                  />
                  <NumberField
                    label="Preferred slope (°)"
                    value={config.preferredSlope}
                    min={0}
                    max={59}
                    set={(value) => setConfig((c) => ({ ...c, preferredSlope: value }))}
                  />
                  <NumberField
                    label="Review slope (°)"
                    value={config.reviewSlope}
                    min={1}
                    max={60}
                    set={(value) => setConfig((c) => ({ ...c, reviewSlope: value }))}
                  />
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className={buttonClass}
                    disabled={processing || coordinateType === "geographic"}
                    onClick={() => process()}
                  >
                    Process terrain
                  </button>
                  {processing && (
                    <button className={buttonClass} onClick={() => cancel()}>
                      Cancel processing
                    </button>
                  )}
                  <button className={buttonClass} onClick={startOver}>
                    Start over
                  </button>
                </div>
              </section>
            </>
          )}
          {stage && (
            <section
              aria-live="polite"
              className="rounded-2xl border border-glass-border bg-card/50 p-5"
            >
              <h2 className="text-lg font-semibold">Processing status</h2>
              <p className="mt-2 text-sm capitalize">{stage.replaceAll("-", " ")}</p>
              {processing && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-full animate-pulse bg-primary/70" />
                </div>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              )}
            </section>
          )}
          {error && !stage && (
            <p
              role="alert"
              className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {result && (
            <TerrainReview
              analysis={result.analysis}
              parsed={result.parsed}
              layer={layer}
              setLayer={setLayer}
              showPoints={showPoints}
              setShowPoints={setShowPoints}
              showContours={showContours}
              setShowContours={setShowContours}
              zoom={zoom}
              setZoom={setZoom}
              selectedCell={selectedCell}
              setSelectedCell={setSelectedCell}
              onDownload={() => void download()}
              onStartOver={startOver}
              excludedSourceIndices={excludedSourceIndices}
              onToggleExcluded={(sourceIndex) =>
                setExcludedSourceIndices((current) => {
                  const next = new Set(current);
                  if (next.has(sourceIndex)) next.delete(sourceIndex);
                  else next.add(sourceIndex);
                  return next;
                })
              }
              onRestoreAll={() => {
                const restored = new Set<number>();
                setExcludedSourceIndices(restored);
                process(restored);
              }}
              onReprocess={() => process()}
            />
          )}
        </div>
      </section>
    </RenewablePage>
  );
}

function readTerrainFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected terrain file could not be read."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The selected terrain file did not contain readable text."));
    reader.readAsText(file);
  });
}

function TerrainReview(props: {
  analysis: TerrainAnalysis;
  parsed: TerrainParseResult;
  layer: "elevation" | "slope" | "aspect" | "buildability";
  setLayer: (value: "elevation" | "slope" | "aspect" | "buildability") => void;
  showPoints: boolean;
  setShowPoints: (value: boolean) => void;
  showContours: boolean;
  setShowContours: (value: boolean) => void;
  zoom: number;
  setZoom: (value: number) => void;
  selectedCell: number | null;
  setSelectedCell: (value: number | null) => void;
  onDownload: () => void;
  onStartOver: () => void;
  excludedSourceIndices: Set<number>;
  onToggleExcluded: (sourceIndex: number) => void;
  onRestoreAll: () => void;
  onReprocess: () => void;
}) {
  const { analysis, parsed } = props;
  const grid = analysis.grid;
  const finiteElevations = grid.elevations.filter((v): v is number => v !== null);
  const minZ = Math.min(...finiteElevations),
    maxZ = Math.max(...finiteElevations);
  const width = 800,
    height = 520;
  const cellW = width / grid.columns,
    cellH = height / grid.rows;
  const color = (index: number) => {
    const elevation = grid.elevations[index];
    if (elevation === null) return "#374151";
    if (props.layer === "elevation") {
      const t = (elevation - minZ) / Math.max(maxZ - minZ, 1e-9);
      return `hsl(${220 - t * 180} 65% 48%)`;
    }
    if (props.layer === "slope") {
      const slope = analysis.slopes[index];
      return slope === null ? "#374151" : `hsl(${120 - Math.min(slope, 30) * 4} 70% 48%)`;
    }
    if (props.layer === "aspect") {
      const aspect = analysis.aspects[index];
      return aspect === null ? "#64748b" : `hsl(${aspect} 65% 50%)`;
    }
    const category = analysis.buildability[index];
    return category === "preferred"
      ? "#22c55e"
      : category === "review-required"
        ? "#eab308"
        : category === "excluded-by-slope"
          ? "#ef4444"
          : "#374151";
  };
  const maxRendered = 20_000;
  const step = Math.max(1, Math.ceil(grid.elevations.length / maxRendered));
  const selected =
    props.selectedCell === null
      ? null
      : {
          elevation: grid.elevations[props.selectedCell],
          slope: analysis.slopes[props.selectedCell],
          aspect: analysis.aspects[props.selectedCell],
          buildability: analysis.buildability[props.selectedCell],
        };
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);
  const screened = [
    ...analysis.quality.spikePointIndices.map((index) => ({
      index,
      finding: "Possible elevation spike",
    })),
    ...analysis.quality.isolatedPointIndices.map((index) => ({
      index,
      finding: "Possible isolated point",
    })),
    ...analysis.quality.coordinateOutlierIndices.map((index) => ({
      index,
      finding: "Possible coordinate outlier",
    })),
  ]
    .filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.index === item.index) === index,
    )
    .slice(0, 100);
  return (
    <>
      <section className="rounded-2xl border border-glass-border bg-card/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">4. Professional 2D terrain review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Plan-view engineering preview; select a cell for accessible numeric details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              aria-label="Zoom out"
              onClick={() => props.setZoom(Math.max(0.5, props.zoom / 1.25))}
            >
              −
            </button>
            <button
              className={buttonClass}
              aria-label="Fit terrain to extent"
              onClick={() => {
                props.setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Fit
            </button>
            <button
              className={buttonClass}
              aria-label="Zoom in"
              onClick={() => props.setZoom(Math.min(4, props.zoom * 1.25))}
            >
              +
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Select
              label="Review layer"
              value={props.layer}
              set={(value) => props.setLayer(value as typeof props.layer)}
              options={[
                ["elevation", "Elevation (m)"],
                ["slope", "Slope (degrees)"],
                ["aspect", "Aspect (clockwise from north)"],
                ["buildability", "Slope screening"],
              ]}
            />
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={props.showPoints}
                onChange={(event) => props.setShowPoints(event.target.checked)}
              />{" "}
              Show source points
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={props.showContours}
                onChange={(event) => props.setShowContours(event.target.checked)}
              />{" "}
              Show contours
            </label>
            <div className="rounded-xl bg-background/60 p-4 text-sm">
              <p className="font-semibold">Legend</p>
              <p className="mt-2 text-muted-foreground">
                {props.layer === "elevation"
                  ? `${minZ.toFixed(2)}–${maxZ.toFixed(2)} m`
                  : props.layer === "slope"
                    ? "0–30+ degrees"
                    : props.layer === "aspect"
                      ? "0° north, 90° east"
                      : "Green preferred · Amber review · Red excluded"}
              </p>
            </div>
            {selected && (
              <dl className="rounded-xl bg-background/60 p-4 text-sm">
                <dt className="font-semibold">Selected cell</dt>
                <dd className="mt-2">Elevation: {selected.elevation?.toFixed(3) ?? "No data"} m</dd>
                <dd>Slope: {selected.slope?.toFixed(2) ?? "No data"}°</dd>
                <dd>Aspect: {selected.aspect?.toFixed(1) ?? "Flat/no data"}°</dd>
                <dd>Screening: {selected.buildability}</dd>
              </dl>
            )}
          </aside>
          <div className="overflow-hidden rounded-xl border border-glass-border bg-background/60">
            <svg
              role="img"
              aria-label={`${props.layer} terrain plan view`}
              viewBox={`0 0 ${width} ${height}`}
              className="min-h-[360px] w-full"
              onPointerDown={(event) => {
                drag.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  originX: pan.x,
                  originY: pan.y,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const active = drag.current;
                if (!active || active.pointerId !== event.pointerId) return;
                setPan({
                  x: active.originX + event.clientX - active.x,
                  y: active.originY + event.clientY - active.y,
                });
              }}
              onPointerUp={(event) => {
                if (drag.current?.pointerId === event.pointerId) drag.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              style={{ touchAction: "none", cursor: drag.current ? "grabbing" : "grab" }}
            >
              <g transform={`translate(${pan.x} ${pan.y}) scale(${props.zoom})`}>
                {grid.elevations.map((_, index) =>
                  index % step === 0 ? (
                    <rect
                      key={index}
                      x={(index % grid.columns) * cellW}
                      y={height - (Math.floor(index / grid.columns) + 1) * cellH}
                      width={Math.max(cellW * step, 0.5)}
                      height={Math.max(cellH, 0.5)}
                      fill={color(index)}
                      onClick={() => props.setSelectedCell(index)}
                      tabIndex={index === 0 ? 0 : undefined}
                    />
                  ) : null,
                )}
                {props.showContours &&
                  analysis.contours.flatMap((contour) =>
                    contour.segments
                      .slice(0, 2000)
                      .map((segment, index) => (
                        <line
                          key={`${contour.elevation}-${index}`}
                          x1={
                            ((segment[0][0] - grid.originX) / (grid.columns * grid.spacing)) * width
                          }
                          y1={
                            height -
                            ((segment[0][1] - grid.originY) / (grid.rows * grid.spacing)) * height
                          }
                          x2={
                            ((segment[1][0] - grid.originX) / (grid.columns * grid.spacing)) * width
                          }
                          y2={
                            height -
                            ((segment[1][1] - grid.originY) / (grid.rows * grid.spacing)) * height
                          }
                          stroke="white"
                          strokeOpacity=".65"
                          strokeWidth="1"
                        />
                      )),
                  )}
                {props.showPoints &&
                  parsed.points
                    .filter(
                      (_, index) =>
                        index % Math.max(1, Math.ceil(parsed.points.length / 5000)) === 0,
                    )
                    .map((point) => (
                      <circle
                        key={point.sourceIndex}
                        cx={((point.x - grid.originX) / (grid.columns * grid.spacing)) * width}
                        cy={
                          height - ((point.y - grid.originY) / (grid.rows * grid.spacing)) * height
                        }
                        r="1.5"
                        fill="white"
                      />
                    ))}
              </g>
            </svg>
          </div>
        </div>
      </section>
      <TerrainStats analysis={analysis} parsed={parsed} />
      <section className="rounded-2xl border border-glass-border bg-card/50 p-5">
        <h2 className="text-xl font-semibold">Screened-point review</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Findings are conservative screening indicators. Points remain retained unless you
          explicitly select them for exclusion and reprocess.
        </p>
        {screened.length ? (
          <ul className="mt-4 max-h-64 space-y-2 overflow-auto">
            {screened.map((item) => {
              const point = parsed.points[item.index];
              if (!point) return null;
              return (
                <li key={point.sourceIndex} className="rounded-lg border border-glass-border p-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={props.excludedSourceIndices.has(point.sourceIndex)}
                      onChange={() => props.onToggleExcluded(point.sourceIndex)}
                    />
                    <span>
                      Source point {point.sourceIndex + 1}: {item.finding}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No screened point findings were produced.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className={buttonClass}
            disabled={props.excludedSourceIndices.size === 0}
            onClick={props.onReprocess}
          >
            Reprocess with selected exclusions
          </button>
          <button
            className={buttonClass}
            disabled={props.excludedSourceIndices.size === 0}
            onClick={props.onRestoreAll}
          >
            Restore all excluded points
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Selected exclusions: {props.excludedSourceIndices.size}. Exclusion source indices are
          recorded in analysis metadata.
        </p>
      </section>
      <section className="rounded-2xl border border-warning/30 bg-warning/10 p-5">
        <h2 className="text-xl font-semibold">Engineering limitations</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Buildability is a preliminary slope-based screening result. It does not account for
          geotechnical conditions, drainage, environmental restrictions, access, grading,
          foundations, setbacks, or authority requirements. Screened outliers and spikes are
          possible findings, not statements that source points are incorrect.
        </p>
      </section>
      <div className="flex flex-wrap gap-3">
        <button className={buttonClass} onClick={props.onDownload}>
          Download terrain DraflioScene
        </button>
        <button className={buttonClass} onClick={props.onStartOver}>
          Start over
        </button>
      </div>
    </>
  );
}

function TerrainStats({
  analysis,
  parsed,
}: {
  analysis: TerrainAnalysis;
  parsed: TerrainParseResult;
}) {
  const elevations = analysis.grid.elevations.filter((v): v is number => v !== null);
  const slopes = analysis.slopes.filter((v): v is number => v !== null);
  const items: [string, string | number][] = [
    ["Imported rows", parsed.acceptedRows + parsed.rejectedRows],
    ["Retained points", parsed.points.length],
    ["Rejected rows", parsed.rejectedRows],
    ["Exact duplicates", parsed.exactDuplicateCount],
    ["Conflicting duplicates", parsed.conflictingDuplicateCount],
    ["Grid", `${analysis.grid.rows} × ${analysis.grid.columns}`],
    ["Grid spacing", `${analysis.grid.spacing} m`],
    ["Valid / no-data cells", `${analysis.grid.filledCells} / ${analysis.grid.noDataCells}`],
    [
      "Vertices / triangles",
      `${analysis.mesh.vertices.length} / ${analysis.mesh.triangles.length}`,
    ],
    ["Contour levels", analysis.contours.length],
    [
      "Elevation range",
      `${Math.min(...elevations).toFixed(2)}–${Math.max(...elevations).toFixed(2)} m`,
    ],
    [
      "Slope range",
      slopes.length
        ? `${Math.min(...slopes).toFixed(2)}–${Math.max(...slopes).toFixed(2)}°`
        : "No data",
    ],
    ["Possible spikes", analysis.quality.spikePointIndices.length],
    ["Possible isolated points", analysis.quality.isolatedPointIndices.length],
    ["Processing duration", `${analysis.durationMs.toFixed(1)} ms`],
  ];
  return (
    <section aria-labelledby="terrain-statistics">
      <h2 id="terrain-statistics" className="text-2xl font-semibold">
        5. Terrain statistics and quality findings
      </h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-glass-border bg-card/40 p-4">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">
        Quality checks are deterministic screening findings and are not engineering certification.
        No screened point is removed automatically.
      </p>
    </section>
  );
}

function Select({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  options: (readonly [string, string])[];
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select value={value} onChange={(event) => set(event.target.value)} className={inputClass}>
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Field({
  label,
  value,
  set,
  type = "text",
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => set(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  set,
  min,
  max,
}: {
  label: string;
  value: number;
  set: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step="any"
        onChange={(event) => set(Number(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}
