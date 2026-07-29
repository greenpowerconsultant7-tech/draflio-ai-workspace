import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw, Upload, X } from "lucide-react";
import {
  importWeatherText,
  parseCsv,
} from "../../../../shared/renewableEnergy/weather/weatherCore";
import {
  isWeatherValidationResult,
  safeWeatherFilename,
  serializeCanonicalCsv,
  serializeFindingsCsv,
  serializeSummary,
  validateReviewExport,
} from "../../../../shared/renewableEnergy/weather/weatherSerialization";
import {
  WEATHER_SCHEMA,
  WEATHER_SCHEMA_VERSION,
  WEATHER_STAGE,
  WEATHER_TRANSITIONS,
  type WeatherColumnMapping,
  type WeatherDataset,
  type WeatherReviewRecord,
  type WeatherReviewStatus,
  type WeatherValidationResult,
} from "../../../../shared/renewableEnergy/weather/weatherTypes";

type WorkerMessage =
  | { type: "progress"; generation: number; percent: number; stage: string }
  | { type: "success"; generation: number; result: WeatherValidationResult }
  | { type: "error"; generation: number; message: string };
const defaultMapping: WeatherColumnMapping = {
  timestamp: "timestamp",
  ghi: "GHI",
  dni: "DNI",
  dhi: "DHI",
  ambientTemperature: "temperature",
  windSpeed: "wind_speed",
  relativeHumidity: "humidity",
  atmosphericPressure: "pressure",
  stationStatus: "status",
  sourceQualityCode: "quality_code",
};
const defaultUnits = {
  ghi: "W/m²",
  dni: "W/m²",
  dhi: "W/m²",
  ambientTemperature: "°C",
  windSpeed: "m/s",
  relativeHumidity: "%",
  atmosphericPressure: "Pa",
};

export function WeatherWorkspace() {
  const [projectId, setProjectId] = useState("solar-project-001");
  const [timezone, setTimezone] = useState("+05:30");
  const [latitude, setLatitude] = useState("20");
  const [longitude, setLongitude] = useState("78");
  const [elevation, setElevation] = useState("0");
  const [format, setFormat] = useState<"epw" | "draflio-csv" | "mapped-csv" | "tmy-csv">("epw");
  const [dataset, setDataset] = useState<WeatherDataset>();
  const [result, setResult] = useState<WeatherValidationResult>();
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<WeatherReviewStatus>("Draft");
  const [note, setNote] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [history, setHistory] = useState<WeatherReviewRecord["history"]>([]);
  const [severity, setSeverity] = useState("All");
  const [variable, setVariable] = useState("All");
  const [chartVariable, setChartVariable] = useState("ghi");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [chartLimit, setChartLimit] = useState(720);
  const [mapping, setMapping] = useState(defaultMapping);
  const [units, setUnits] = useState(defaultUnits);
  const workerRef = useRef<Worker | undefined>(undefined);
  const generation = useRef(0);
  const urls = useRef<string[]>([]);
  const revocationTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const clearRevocationTimers = () => {
    revocationTimers.current.forEach(clearTimeout);
    revocationTimers.current.clear();
  };
  const revokeUrls = () => {
    clearRevocationTimers();
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
  };
  const cancel = () => {
    generation.current += 1;
    workerRef.current?.terminate();
    workerRef.current = undefined;
    setProgress(0);
    setError("Validation cancelled; no partial result was accepted.");
  };
  useEffect(
    () => () => {
      generation.current += 1;
      workerRef.current?.terminate();
      revocationTimers.current.forEach(clearTimeout);
      revocationTimers.current.clear();
      urls.current.forEach(URL.revokeObjectURL);
      urls.current = [];
    },
    [],
  );
  const current = dataset?.versions.at(-1);
  const filtered = useMemo(
    () =>
      (result?.findings ?? []).filter(
        (finding) =>
          (severity === "All" || finding.severity === severity) &&
          (variable === "All" || finding.variable === variable),
      ),
    [result, severity, variable],
  );
  const chart = useMemo(() => {
    const source = (result?.records ?? []).filter(
      (record) =>
        (!rangeStart || record.timestamp >= new Date(rangeStart).toISOString()) &&
        (!rangeEnd || record.timestamp <= new Date(rangeEnd).toISOString()),
    );
    const step = Math.max(1, Math.ceil(source.length / chartLimit));
    return source
      .filter((_, index) => index % step === 0)
      .map((record) => ({
        timestamp: record.timestamp,
        value:
          typeof record.values[chartVariable as keyof typeof record.values] === "number"
            ? Number(record.values[chartVariable as keyof typeof record.values])
            : null,
      }));
  }, [result, chartVariable, rangeStart, rangeEnd, chartLimit]);
  const rawChart = useMemo(() => {
    if (!current) return [];
    try {
      const rows = parseCsv(current.source.originalText);
      const epw = current.source.format === "epw";
      const headers = epw ? [] : rows[0];
      const sourceHeader = mapping[chartVariable as keyof WeatherColumnMapping];
      const column = epw
        ? ({ ghi: 13, dni: 14, dhi: 15, ambientTemperature: 6, windSpeed: 21 }[chartVariable] ?? -1)
        : headers.indexOf(sourceHeader ?? "");
      if (column < 0) return [];
      const values = rows.slice(epw ? 8 : 1);
      const step = Math.max(1, Math.ceil(values.length / chartLimit));
      return values
        .filter((_, index) => index % step === 0)
        .map((row, index) => ({
          timestamp: current.records[index * step]?.timestamp ?? "",
          value: row[column]?.trim() === "" ? null : Number(row[column]),
        }));
    } catch {
      return [];
    }
  }, [current, mapping, chartVariable, chartLimit]);
  async function onFile(file: File) {
    setError("");
    setResult(undefined);
    cancel();
    setError("");
    try {
      const bytes = await file.arrayBuffer();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sourceHash = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);
      const offsetMinutes = offsetMatch
        ? (offsetMatch[1] === "-" ? -1 : 1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
        : undefined;
      const imported = importWeatherText(text, {
        project: { projectId, projectName: projectId },
        filename: file.name,
        mimeType: file.type || "text/plain",
        format,
        timezone:
          format === "epw" ? undefined : { kind: "fixed-offset", value: timezone, offsetMinutes },
        latitude: Number(latitude),
        longitude: Number(longitude),
        elevationMetres: Number(elevation),
        sourceName: file.name,
        mapping,
        units,
        importedAt: new Date().toISOString(),
        sourceId: `sha256:${sourceHash}`,
        sourceHash: `sha256:${sourceHash}`,
      });
      setDataset(imported.dataset);
      setStatus(
        imported.structuralFindings.some((finding) => finding.modellingBlocked)
          ? "Structurally invalid"
          : "Imported",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
      setStatus("Structurally invalid");
    }
  }
  async function onReviewFile(file: File) {
    setError("");
    try {
      const review = JSON.parse(await file.text()) as WeatherReviewRecord;
      if (review.dataset.project.projectId !== projectId)
        throw new Error("Cross-project weather review import rejected.");
      validateReviewExport(review);
      setDataset(review.dataset);
      setStatus(review.status);
      setHistory(review.history);
      const version = review.dataset.versions.find(
        (item) => item.version === review.currentVersion,
      );
      if (version?.summary)
        setResult({
          records: version.records,
          findings: version.findings,
          summary: version.summary,
        });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Weather review import failed.");
    }
  }
  function validate() {
    if (!current) return;
    cancel();
    setError("");
    setResult(undefined);
    const token = generation.current;
    const worker = new Worker(new URL("./weatherWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || message.generation !== token || worker !== workerRef.current) return;
      if (message.type === "progress") setProgress(message.percent);
      else {
        worker.terminate();
        workerRef.current = undefined;
        if (message.type === "success" && isWeatherValidationResult(message.result)) {
          setResult(message.result);
          setStatus(
            message.result.summary.readiness === "Blocked pending correction"
              ? "Structurally invalid"
              : "Valid with warnings",
          );
        } else
          setError(
            message.type === "error" ? message.message : "Malformed worker result rejected.",
          );
      }
    };
    worker.onerror = () => {
      if (worker === workerRef.current && token === generation.current)
        setError("Weather validation worker failed.");
      worker.terminate();
      if (worker === workerRef.current) workerRef.current = undefined;
    };
    worker.postMessage({
      type: "validate",
      generation: token,
      records: current.records,
      interval: current.source.interval,
      source: {
        latitude: current.source.latitude,
        longitude: current.source.longitude,
        timezone: current.source.timezone,
        sourceUnits: current.source.sourceUnits,
      },
    });
  }
  function transition(to: WeatherReviewStatus) {
    if (!WEATHER_TRANSITIONS[status].includes(to))
      return setError(`Transition ${status} → ${to} is not allowed.`);
    if (!reviewer.trim() || !note.trim())
      return setError("Reviewer and engineering note are required.");
    if (
      to === "Approved for preliminary modelling" &&
      (!result ||
        result.findings.some((finding) => finding.modellingBlocked && !finding.acknowledged))
    )
      return setError("Approval is blocked by unresolved blocking findings.");
    setHistory((items) => [
      ...items,
      {
        sequence: items.length + 1,
        from: status,
        to,
        reviewer,
        timestamp: new Date().toISOString(),
        note,
        decision: to,
      },
    ]);
    setStatus(to);
    setNote("");
    setError("");
  }
  function download(kind: "review" | "canonical" | "findings" | "summary") {
    if (!dataset || !result)
      return setError("A completed current validation is required before export.");
    try {
      revokeUrls();
      const review: WeatherReviewRecord = {
        schema: WEATHER_SCHEMA,
        schemaVersion: WEATHER_SCHEMA_VERSION,
        calculationStage: WEATHER_STAGE,
        dataset: {
          ...dataset,
          versions: dataset.versions.map((version) => ({
            ...version,
            records: result.records,
            findings: result.findings,
            summary: result.summary,
            source: { ...version.source, reviewStatus: status },
          })),
        },
        currentVersion: current!.version,
        status,
        history,
        limitations: [
          "Weather quality review only; no energy-yield or transposition calculation is included.",
        ],
      };
      const content =
        kind === "review"
          ? validateReviewExport(review)
          : kind === "canonical"
            ? serializeCanonicalCsv(result)
            : kind === "findings"
              ? serializeFindingsCsv(result)
              : serializeSummary(result);
      const blob = new Blob([content], {
        type: kind === "review" || kind === "summary" ? "application/json" : "text/csv",
      });
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeWeatherFilename(
        current!.source.filename,
        `${kind}.${kind === "review" || kind === "summary" ? "json" : "csv"}`,
      );
      anchor.click();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current = urls.current.filter((item) => item !== url);
        revocationTimers.current.delete(timer);
      }, 0);
      revocationTimers.current.add(timer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    }
  }
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8" data-testid="weather-workspace">
      <header>
        <p className="text-sm font-semibold text-amber-700">
          RE8A · Browser-local resource foundation
        </p>
        <h1 className="text-3xl font-bold">Solar weather resources</h1>
        <p className="mt-2 text-muted-foreground">
          Prepare deterministic, source-preserving weather inputs. This workspace does not calculate
          plant generation, energy yield, CUF, performance ratio, P50/P75/P90, or bankable results.
        </p>
      </header>
      {error && (
        <div role="alert" className="rounded border border-red-400 bg-red-50 p-3 text-red-900">
          {error}
        </div>
      )}
      <section aria-labelledby="import-title" className="rounded-xl border p-4">
        <h2 id="import-title" className="text-xl font-semibold">
          1. Project and source
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label="Project ID" value={projectId} onChange={setProjectId} />
          <label>
            Format
            <select
              className="mt-1 w-full rounded border p-2"
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              <option value="epw">EPW</option>
              <option value="draflio-csv">Draflio canonical CSV</option>
              <option value="mapped-csv">Mapped CSV</option>
              <option value="tmy-csv">TMY-style CSV</option>
            </select>
          </label>
          <Field label="Timezone / UTC offset" value={timezone} onChange={setTimezone} />
          <Field label="Latitude" value={latitude} onChange={setLatitude} />
          <Field label="Longitude" value={longitude} onChange={setLongitude} />
          <Field label="Elevation (m)" value={elevation} onChange={setElevation} />
        </div>
        {format !== "epw" && (
          <details className="mt-4">
            <summary className="cursor-pointer font-medium">Controlled CSV mapping</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {Object.entries(mapping).map(([key, value]) => (
                <Field
                  key={key}
                  label={`${key} source header`}
                  value={value ?? ""}
                  onChange={(next) => {
                    setMapping((item) => ({ ...item, [key]: next }));
                    if (status === "Reviewed" || status === "Approved for preliminary modelling")
                      setStatus("Stale");
                  }}
                />
              ))}
              {Object.entries(units).map(([key, value]) => (
                <Field
                  key={`${key}-unit`}
                  label={`${key} source unit`}
                  value={value}
                  onChange={(next) => {
                    setUnits((item) => ({ ...item, [key]: next }));
                    if (status === "Reviewed" || status === "Approved for preliminary modelling")
                      setStatus("Stale");
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-sm">
              Canonical units: irradiance W/m²; temperature °C; wind m/s; pressure Pa. Only explicit
              documented conversions are accepted.
            </p>
          </details>
        )}
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded bg-primary px-4 py-2 text-primary-foreground focus-within:ring-2">
          <Upload size={18} />
          Import weather file
          <input
            className="sr-only"
            type="file"
            accept=".epw,.csv,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </label>
        <label className="ml-2 mt-4 inline-flex cursor-pointer items-center gap-2 rounded border px-4 py-2 focus-within:ring-2">
          Import weather review JSON
          <input
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onReviewFile(file);
            }}
          />
        </label>
      </section>
      {current && (
        <>
          <section className="rounded-xl border p-4">
            <h2 className="text-xl font-semibold">2. Source metadata and validation</h2>
            <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
              <Metric label="Filename" value={current.source.filename} />
              <Metric label="Format" value={current.source.format} />
              <Metric label="Bytes" value={String(current.source.byteSize)} />
              <Metric label="Records" value={String(current.records.length)} />
              <Metric label="Period" value={current.source.sourcePeriod} />
              <Metric label="Location" value={current.source.declaredLocation} />
              <Metric
                label="Coordinates"
                value={`${current.source.latitude}, ${current.source.longitude}`}
              />
              <Metric label="Elevation" value={`${current.source.elevationMetres} m`} />
              <Metric label="Timezone" value={current.source.timezone?.value ?? "Missing"} />
              <Metric
                label="Interval"
                value={
                  current.source.interval
                    ? `${current.source.interval.minutes} min (${Math.round(current.source.interval.confidence * 100)}% confidence)`
                    : "Not evaluated"
                }
              />
              <Metric label="Parser" value={current.source.parserVersion} />
              <Metric label="Validation" value={current.source.validationVersion} />
              <Metric label="Review status" value={status} />
              <Metric label="Processing" value="Browser-local; immutable original text retained" />
            </dl>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded bg-primary px-4 py-2 text-primary-foreground focus-visible:ring-2"
                onClick={validate}
              >
                Start validation
              </button>
              <button className="rounded border px-4 py-2 focus-visible:ring-2" onClick={cancel}>
                <X className="inline" size={16} /> Cancel
              </button>
            </div>
            <progress
              className="mt-3 w-full"
              max="100"
              value={progress}
              aria-label="Weather validation progress"
            />
            <p aria-live="polite">{progress ? `${progress}%` : "Not running"}</p>
          </section>
          {result && (
            <>
              <section className="rounded-xl border p-4">
                <h2 className="text-xl font-semibold">3. Quality summary</h2>
                <dl className="mt-3 grid gap-2 md:grid-cols-4">
                  <Metric label="Readiness" value={result.summary.readiness} />
                  <Metric
                    label="Imported / expected"
                    value={`${result.summary.importedRecordCount} / ${result.summary.expectedRecordCount ?? "Not evaluated"}`}
                  />
                  <Metric
                    label="Valid / invalid"
                    value={`${result.summary.validRecordCount} / ${result.summary.invalidRecordCount}`}
                  />
                  <Metric label="Warnings" value={String(result.summary.warningRecordCount)} />
                  <Metric
                    label="Missing / duplicate"
                    value={`${result.summary.missingTimestamps} / ${result.summary.duplicateTimestamps}`}
                  />
                  <Metric label="Interval" value={result.summary.intervalConsistency} />
                  <Metric
                    label="Location / timezone / units"
                    value={`${result.summary.locationComplete} / ${result.summary.timezoneComplete} / ${result.summary.unitsComplete}`}
                  />
                  <Metric label="Source confidence" value={result.summary.sourceConfidence} />
                </dl>
              </section>
              <section className="rounded-xl border p-4">
                <h2 className="text-xl font-semibold">4. Visual review</h2>
                <div className="mt-3 flex flex-wrap gap-3">
                  <label>
                    Variable
                    <select
                      className="ml-2 rounded border p-2"
                      value={chartVariable}
                      onChange={(e) => setChartVariable(e.target.value)}
                    >
                      {["ghi", "dni", "dhi", "ambientTemperature", "windSpeed"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    From
                    <input
                      type="datetime-local"
                      className="ml-2 rounded border p-2"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="datetime-local"
                      className="ml-2 rounded border p-2"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                    />
                  </label>
                  <button
                    className="rounded border px-3 focus-visible:ring-2"
                    onClick={() => {
                      setRangeStart("");
                      setRangeEnd("");
                      setChartLimit(720);
                    }}
                  >
                    <RotateCcw className="inline" size={16} /> Reset view
                  </button>
                  <button
                    className="rounded border px-3 focus-visible:ring-2"
                    onClick={() => setChartLimit((value) => Math.min(2880, value * 2))}
                  >
                    Zoom in
                  </button>
                  <button
                    className="rounded border px-3 focus-visible:ring-2"
                    onClick={() => setChartLimit((value) => Math.max(90, Math.floor(value / 2)))}
                  >
                    Zoom out
                  </button>
                </div>
                <p className="mt-2 text-sm">
                  Canonical unit-converted measurements; deterministically downsampled to at most
                  720 display points. Exports retain every authoritative record.
                </p>
                {rawChart.length ? (
                  <WeatherChart
                    label={`Raw source ${chartVariable} time-series chart with ${rawChart.length} displayed points`}
                    points={rawChart}
                  />
                ) : (
                  <p className="mt-4 rounded bg-muted p-4">Raw source chart unavailable.</p>
                )}
                {chart.length ? (
                  <svg
                    role="img"
                    aria-label={`Canonical ${chartVariable} time-series chart with ${chart.length} displayed points`}
                    tabIndex={0}
                    className="mt-3 h-56 w-full rounded border focus-visible:ring-2"
                    viewBox="0 0 720 200"
                  >
                    {chart.map((point, index) =>
                      point.value === null ? (
                        <path
                          key={`${point.timestamp}-${index}`}
                          d={`M ${Math.max(0, (index / Math.max(1, chart.length - 1)) * 720 - 3)} 187 l 6 6 m -6 0 l 6 -6`}
                          stroke="currentColor"
                          aria-label={`Missing value at ${point.timestamp}`}
                        />
                      ) : (
                        <circle
                          key={`${point.timestamp}-${index}`}
                          cx={(index / Math.max(1, chart.length - 1)) * 720}
                          cy={190 - Math.max(0, Math.min(180, point.value / 10))}
                          r="1.5"
                          fill="currentColor"
                          data-duplicate={
                            result.summary.duplicateTimestamps &&
                            result.findings.some(
                              (finding) =>
                                finding.code === "TIME_DUPLICATE" &&
                                finding.startTimestamp === point.timestamp,
                            )
                              ? "true"
                              : undefined
                          }
                        >
                          <title>
                            {point.timestamp}: {point.value}
                          </title>
                        </circle>
                      ),
                    )}
                  </svg>
                ) : (
                  <p className="mt-4 rounded bg-muted p-4">No data in the selected range.</p>
                )}
                {result.summary.invalidRecordCount > 0 && (
                  <p className="mt-2 text-sm" role="status">
                    Invalid-data markers are retained in the findings and canonical chart.
                  </p>
                )}
                <table className="mt-3 w-full text-left text-sm">
                  <caption className="sr-only">Textual equivalent of displayed chart</caption>
                  <thead>
                    <tr>
                      <th>First timestamp</th>
                      <th>Last timestamp</th>
                      <th>Displayed points</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{chart[0]?.timestamp ?? "No data"}</td>
                      <td>{chart.at(-1)?.timestamp ?? "No data"}</td>
                      <td>{chart.length}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
              <section className="rounded-xl border p-4">
                <h2 className="text-xl font-semibold">5. Findings</h2>
                <div className="mt-3 flex gap-3">
                  <label>
                    Severity
                    <select
                      className="ml-2 rounded border p-2"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                    >
                      {["All", "Error", "Warning", "Information", "Not evaluated"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Variable
                    <select
                      className="ml-2 rounded border p-2"
                      value={variable}
                      onChange={(e) => setVariable(e.target.value)}
                    >
                      {[
                        "All",
                        "timestamp",
                        "ghi",
                        "dni",
                        "dhi",
                        "ambientTemperature",
                        "windSpeed",
                        "relativeHumidity",
                        "atmosphericPressure",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Code</th>
                        <th>Variable/time</th>
                        <th>Evidence</th>
                        <th>Acknowledge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((finding) => (
                        <tr key={finding.id} className="border-t">
                          <td>
                            {finding.severity}
                            {finding.modellingBlocked ? " · blocking" : ""}
                          </td>
                          <td>{finding.code}</td>
                          <td>
                            {finding.variable ?? "dataset"}
                            <br />
                            {finding.startTimestamp}
                          </td>
                          <td>{finding.explanation}</td>
                          <td>
                            <button
                              className="rounded border p-1 focus-visible:ring-2"
                              onClick={() =>
                                setResult((old) =>
                                  old
                                    ? {
                                        ...old,
                                        findings: old.findings.map((item) =>
                                          item.id === finding.id
                                            ? { ...item, acknowledged: true, reviewerNote: note }
                                            : item,
                                        ),
                                      }
                                    : old,
                                )
                              }
                              aria-label={`Acknowledge ${finding.code}`}
                            >
                              Acknowledge
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="rounded-xl border p-4">
                <h2 className="text-xl font-semibold">6. Governance and export</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Field label="Reviewer" value={reviewer} onChange={setReviewer} />
                  <label>
                    Engineering note
                    <textarea
                      className="mt-1 w-full rounded border p-2"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded border px-3 py-2 focus-visible:ring-2"
                    onClick={() => transition("Reviewed")}
                  >
                    Mark reviewed
                  </button>
                  <button
                    className="rounded border px-3 py-2 focus-visible:ring-2"
                    onClick={() => transition("Approved for preliminary modelling")}
                  >
                    Approve for preliminary modelling
                  </button>
                  <button
                    className="rounded border px-3 py-2 focus-visible:ring-2"
                    onClick={() => transition("Rejected")}
                  >
                    Reject
                  </button>
                  <button
                    className="rounded border px-3 py-2 focus-visible:ring-2"
                    onClick={() => transition("Superseded")}
                  >
                    Supersede
                  </button>
                </div>
                <ol className="mt-3 list-decimal pl-5 text-sm">
                  {history.map((item) => (
                    <li key={item.sequence}>
                      {item.timestamp}: {item.from} → {item.to} by {item.reviewer}; {item.note}
                    </li>
                  ))}
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["review", "canonical", "findings", "summary"] as const).map((kind) => (
                    <button
                      key={kind}
                      className="rounded bg-primary px-3 py-2 text-primary-foreground focus-visible:ring-2"
                      onClick={() => download(kind)}
                    >
                      <Download className="inline" size={16} /> Export {kind}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
      <button
        className="rounded border px-3 py-2 focus-visible:ring-2"
        onClick={() => {
          cancel();
          revokeUrls();
          setDataset(undefined);
          setResult(undefined);
          setHistory([]);
          setStatus("Draft");
          setChartLimit(720);
          setMapping(defaultMapping);
          setUnits(defaultUnits);
          setError("");
        }}
      >
        Start over
      </button>
    </main>
  );
}
function WeatherChart({
  label,
  points,
}: {
  label: string;
  points: { timestamp: string; value: number | null }[];
}) {
  const finiteValues = points
    .map((point) => point.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minimum = Math.min(...finiteValues, 0);
  const maximum = Math.max(...finiteValues, 1);
  return (
    <svg
      role="img"
      aria-label={label}
      tabIndex={0}
      className="mt-3 h-40 w-full rounded border focus-visible:ring-2"
      viewBox="0 0 720 140"
    >
      {points.map((point, index) => {
        const x = (index / Math.max(1, points.length - 1)) * 720;
        return point.value === null || !Number.isFinite(point.value) ? (
          <path
            key={`${point.timestamp}-${index}`}
            d={`M ${Math.max(0, x - 3)} 127 l 6 6 m -6 0 l 6 -6`}
            stroke="currentColor"
            aria-label={`Missing raw value at ${point.timestamp}`}
          />
        ) : (
          <circle
            key={`${point.timestamp}-${index}`}
            cx={x}
            cy={130 - ((point.value - minimum) / Math.max(1, maximum - minimum)) * 120}
            r="1.5"
            fill="currentColor"
          >
            <title>
              {point.timestamp}: {point.value}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        className="mt-1 w-full rounded border p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="break-words text-muted-foreground">{value}</dd>
    </div>
  );
}
