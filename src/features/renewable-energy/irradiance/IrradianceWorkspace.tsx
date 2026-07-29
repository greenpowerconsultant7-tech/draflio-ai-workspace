import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import {
  IRRADIANCE_MODELS,
  buildIrradianceInputReference,
} from "../../../../shared/renewableEnergy/irradiance/irradianceCore";
import {
  safeIrradianceFilename,
  serializeIrradianceCompanion,
  serializeIrradianceComponents,
  serializeIrradianceFindings,
  serializeIrradianceReview,
  serializeIrradianceSummary,
} from "../../../../shared/renewableEnergy/irradiance/irradianceSerialization";
import {
  IRRADIANCE_CALCULATION_VERSION,
  IRRADIANCE_SCHEMA,
  IRRADIANCE_SCHEMA_VERSION,
  IRRADIANCE_SOLAR_VERSION,
  IRRADIANCE_TRANSITIONS,
  type IrradianceCalculationResult,
  type IrradianceModelConfiguration,
  type IrradianceReviewRecord,
  type IrradianceStudyState,
} from "../../../../shared/renewableEnergy/irradiance/irradianceTypes";
import { isIrradianceResult } from "../../../../shared/renewableEnergy/irradiance/irradianceValidation";
import { validateReviewExport } from "../../../../shared/renewableEnergy/weather/weatherSerialization";
import type { WeatherReviewRecord } from "../../../../shared/renewableEnergy/weather/weatherTypes";

type WorkerMessage =
  | { type: "progress"; generation: number; percent: number; stage: string }
  | { type: "success"; generation: number; result: IrradianceCalculationResult }
  | { type: "error"; generation: number; message: string };
const assumptions = [
  "Measured GHI, DNI and DHI always take precedence and remain immutable.",
  "Erbs decomposition estimates only missing DNI or DHI from measured hourly GHI.",
];
const limitations = [
  "No plane-of-array irradiance, transposition, shading loss, temperature, electrical output, generation, energy yield, CUF, performance ratio, probability result, or bankability result is calculated.",
  "Erbs is an empirical hourly diffuse-fraction correlation and low-sun records are excluded.",
];
export function IrradianceWorkspace() {
  const [weather, setWeather] = useState<WeatherReviewRecord>();
  const [result, setResult] = useState<IrradianceCalculationResult>();
  const [calculatedAt, setCalculatedAt] = useState("");
  const [status, setStatus] = useState<IrradianceStudyState>("Draft");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [modelId, setModelId] = useState<IrradianceModelConfiguration["modelId"]>("erbs-hourly");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<IrradianceReviewRecord["history"]>([]);
  const [variable, setVariable] = useState<"ghi" | "dni" | "dhi" | "clearnessIndex">("ghi");
  const [originFilter, setOriginFilter] = useState("All");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [chartLimit, setChartLimit] = useState(720);
  const workerRef = useRef<Worker | undefined>(undefined);
  const generation = useRef(0);
  const urls = useRef<string[]>([]);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const config = useMemo<IrradianceModelConfiguration>(
    () => ({
      modelId,
      modelVersion: modelId === "erbs-hourly" ? "1982-1.0" : "1.0",
      lowSunElevationDegrees: 5,
      reconciliationToleranceWattsPerSquareMetre: 5,
    }),
    [modelId],
  );
  const input = useMemo(() => {
    if (!weather) return undefined;
    try {
      return buildIrradianceInputReference(weather);
    } catch {
      return undefined;
    }
  }, [weather]);
  const model = IRRADIANCE_MODELS.find((item) => item.modelId === modelId)!;
  const cleanupUrls = () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
  };
  const cancel = (show = true) => {
    generation.current += 1;
    workerRef.current?.terminate();
    workerRef.current = undefined;
    setProgress(0);
    setStage("");
    if (show) {
      setResult(undefined);
      setCalculatedAt("");
      setError("Irradiance calculation cancelled; no partial result was accepted.");
      setStatus("Cancelled");
    }
  };
  useEffect(
    () => () => {
      generation.current += 1;
      workerRef.current?.terminate();
      cleanupUrls();
    },
    [],
  );
  async function importWeather(file: File) {
    setError("");
    setResult(undefined);
    setCalculatedAt("");
    cancel(false);
    try {
      const review = JSON.parse(await file.text()) as WeatherReviewRecord;
      validateReviewExport(review);
      if (review.status !== "Approved for preliminary modelling")
        throw new Error(
          review.status === "Stale"
            ? "Stale RE8A weather review rejected."
            : "RE8A weather source must be approved for preliminary modelling.",
        );
      buildIrradianceInputReference(review);
      setWeather(review);
      setHistory([]);
      setStatus("Eligible");
    } catch (caught) {
      setWeather(undefined);
      setStatus("Ineligible");
      setError(caught instanceof Error ? caught.message : "Weather review import failed.");
    }
  }
  function calculate() {
    if (!weather) return;
    cancel(false);
    setError("");
    setResult(undefined);
    setStatus("Calculating");
    const token = generation.current;
    const worker = new Worker(new URL("./irradianceWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || message.generation !== token || worker !== workerRef.current) return;
      if (message.type === "progress") {
        setProgress(message.percent);
        setStage(message.stage);
        return;
      }
      worker.terminate();
      workerRef.current = undefined;
      if (message.type === "success" && isIrradianceResult(message.result)) {
        setResult(message.result);
        setCalculatedAt(new Date().toISOString());
        setStatus(
          message.result.summary.blockingCount
            ? "Invalid"
            : message.result.summary.warningCount
              ? "Valid with warnings"
              : "Calculated—review required",
        );
      } else {
        setStatus("Invalid");
        setError(
          message.type === "error"
            ? message.message
            : "Malformed irradiance worker result rejected.",
        );
      }
    };
    worker.onerror = () => {
      if (worker === workerRef.current && token === generation.current) {
        setError("Irradiance calculation worker failed.");
        setStatus("Invalid");
      }
      worker.terminate();
      if (worker === workerRef.current) workerRef.current = undefined;
    };
    worker.postMessage({
      type: "calculate",
      generation: token,
      weatherReview: weather,
      configuration: config,
    });
  }
  const currentReview = (): IrradianceReviewRecord => {
    if (!weather || !input || !result || !calculatedAt)
      throw new Error("A completed current result is required.");
    return {
      schema: IRRADIANCE_SCHEMA,
      schemaVersion: IRRADIANCE_SCHEMA_VERSION,
      study: {
        studyId: `${input.weatherResourceId}:irradiance`,
        projectId: input.projectId,
        weatherResourceId: input.weatherResourceId,
        versions: [
          {
            version: 1,
            createdAt: calculatedAt,
            input,
            configuration: config,
            records: result.records,
            findings: result.findings,
            summary: result.summary,
            calculationTimestamp: calculatedAt,
            calculationVersion: IRRADIANCE_CALCULATION_VERSION,
            solarPositionVersion: IRRADIANCE_SOLAR_VERSION,
            assumptions,
            limitations,
          },
        ],
      },
      currentVersion: 1,
      status,
      history,
      reviewerNotes: note,
    };
  };
  function transition(to: IrradianceStudyState) {
    if (!IRRADIANCE_TRANSITIONS[status].includes(to))
      return setError(`Transition ${status} → ${to} is not allowed.`);
    if (!reviewer.trim() || !note.trim())
      return setError("Reviewer and engineering note are required.");
    if (
      to === "Approved for preliminary transposition" &&
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
        note,
        timestamp: new Date().toISOString(),
      },
    ]);
    setStatus(to);
    setNote("");
    setError("");
  }
  function download(kind: "review" | "components" | "findings" | "summary" | "companion") {
    try {
      if (!result || !isIrradianceResult(result))
        throw new Error("Current irradiance result failed deep export validation.");
      const review = currentReview();
      const content =
        kind === "review"
          ? serializeIrradianceReview(review)
          : kind === "components"
            ? serializeIrradianceComponents(result!)
            : kind === "findings"
              ? serializeIrradianceFindings(result!)
              : kind === "summary"
                ? serializeIrradianceSummary(result!)
                : serializeIrradianceCompanion(review);
      const mediaType =
        kind === "components" || kind === "findings" ? "text/csv" : "application/json";
      const url = URL.createObjectURL(new Blob([content], { type: `${mediaType};charset=utf-8` }));
      urls.current.push(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeIrradianceFilename(
        input?.weatherResourceId ?? "irradiance",
        `${kind}.${mediaType === "text/csv" ? "csv" : "json"}`,
      );
      anchor.click();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current = urls.current.filter((item) => item !== url);
        timers.current.delete(timer);
      }, 0);
      timers.current.add(timer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Irradiance export failed.");
    }
  }
  const chartRecords = useMemo(() => {
    const source = (result?.records ?? []).filter(
      (record) =>
        (!rangeStart || record.timestamp >= new Date(rangeStart).toISOString()) &&
        (!rangeEnd || record.timestamp <= new Date(rangeEnd).toISOString()) &&
        (originFilter === "All" ||
          [record.ghiOrigin, record.dniOrigin, record.dhiOrigin].includes(
            originFilter as "Measured" | "Estimated",
          )),
    );
    const step = Math.max(1, Math.ceil(source.length / chartLimit));
    return source.filter((_, index) => index % step === 0);
  }, [result, rangeStart, rangeEnd, originFilter, chartLimit]);
  const aggregates = useMemo(() => {
    const days = new Map<string, { ghi: number; dni: number; dhi: number }>();
    const months = new Map<string, { evaluated: number; total: number }>();
    const intervalHours = (result?.summary.intervalMinutes ?? 0) / 60;
    for (const record of result?.records ?? []) {
      const day = record.timestamp.slice(0, 10);
      const month = record.timestamp.slice(0, 7);
      const monthly = months.get(month) ?? { evaluated: 0, total: 0 };
      monthly.total += 1;
      if (
        record.calculationStatus === "Estimated" ||
        record.calculationStatus === "Measured pass-through"
      )
        monthly.evaluated += 1;
      months.set(month, monthly);
      if (
        intervalHours > 0 &&
        (record.calculationStatus === "Estimated" ||
          record.calculationStatus === "Measured pass-through") &&
        record.outputGhi !== null &&
        record.outputDni !== null &&
        record.outputDhi !== null
      ) {
        const daily = days.get(day) ?? { ghi: 0, dni: 0, dhi: 0 };
        daily.ghi += record.outputGhi * intervalHours;
        daily.dni += record.outputDni * intervalHours;
        daily.dhi += record.outputDhi * intervalHours;
        days.set(day, daily);
      }
    }
    return { days: [...days], months: [...months] };
  }, [result]);
  const startOver = () => {
    cancel(false);
    cleanupUrls();
    setWeather(undefined);
    setResult(undefined);
    setCalculatedAt("");
    setStatus("Draft");
    setError("");
    setHistory([]);
    setProgress(0);
  };
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4">
      <header>
        <p className="text-sm font-semibold">RE8B · Irradiance-component modelling only</p>
        <h1 className="text-3xl font-bold">Solar irradiance decomposition</h1>
        <p>
          Convert governed RE8A weather inputs into explicitly labelled component estimates. No
          plane-of-array, transposition, electrical, generation, yield, CUF, PR, P50/P90, or
          bankability result is calculated.
        </p>
      </header>
      {error && (
        <div role="alert" className="rounded border border-red-500 p-3">
          {error}
        </div>
      )}
      <section aria-labelledby="input-title" className="rounded-xl border p-4">
        <h2 id="input-title" className="text-xl font-semibold">
          1. Governed weather input
        </h2>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded bg-primary px-4 py-2 text-primary-foreground focus-within:ring-2">
          <Upload size={18} /> Import approved RE8A review JSON
          <input
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importWeather(file);
            }}
          />
        </label>
        {input && (
          <dl className="mt-3 grid gap-2 md:grid-cols-4">
            <Metric label="Project" value={input.projectId} />
            <Metric label="Weather resource" value={input.weatherResourceId} />
            <Metric label="Source version" value={String(input.weatherResourceVersion)} />
            <Metric label="Source status" value={input.weatherApprovalState} />
            <Metric label="Interval" value={`${input.interval?.minutes ?? "Unknown"} min`} />
            {input.availability.map((item) => (
              <Metric
                key={item.variable}
                label={`${item.variable.toUpperCase()} measured / missing`}
                value={`${item.valid} / ${item.missing}`}
              />
            ))}
          </dl>
        )}
      </section>
      {weather && (
        <>
          <section aria-labelledby="model-title" className="rounded-xl border p-4">
            <h2 id="model-title" className="text-xl font-semibold">
              2. Model eligibility and configuration
            </h2>
            <label>
              Decomposition model
              <select
                aria-label="Decomposition model"
                className="ml-2 rounded border p-2"
                value={modelId}
                onChange={(event) => {
                  cancel(false);
                  setModelId(event.target.value as typeof modelId);
                  if (
                    result ||
                    status === "Reviewed" ||
                    status === "Approved for preliminary transposition"
                  ) {
                    setResult(undefined);
                    setStatus("Stale");
                  }
                }}
              >
                {IRRADIANCE_MODELS.map((item) => (
                  <option key={item.modelId} value={item.modelId}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2">
              <strong>
                {model.name} · {model.version}
              </strong>
            </p>
            <p>{model.reference}</p>
            <p>{model.validityRange}</p>
            <ul className="list-disc pl-6">
              {model.knownLimitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>
              <strong>Eligibility:</strong> {status === "Eligible" ? "Eligible" : status}
            </p>
          </section>
          <section aria-labelledby="calculate-title" className="rounded-xl border p-4">
            <h2 id="calculate-title" className="text-xl font-semibold">
              3. Calculation
            </h2>
            <div className="flex gap-2">
              <button
                className="rounded bg-primary px-4 py-2 text-primary-foreground focus-visible:ring-2"
                onClick={calculate}
              >
                Start calculation
              </button>
              <button
                className="rounded border px-4 py-2 focus-visible:ring-2"
                onClick={() => cancel()}
              >
                <X size={16} className="inline" /> Cancel
              </button>
            </div>
            <progress
              aria-label="Irradiance calculation progress"
              className="mt-3 w-full"
              max={100}
              value={progress}
            />
            <p aria-live="polite">{stage}</p>
          </section>
        </>
      )}
      {result && (
        <>
          <section aria-labelledby="summary-title" className="rounded-xl border p-4">
            <h2 id="summary-title" className="text-xl font-semibold">
              4. Irradiance summary
            </h2>
            <div className="grid gap-2 md:grid-cols-4">
              <Metric
                label="Input / output"
                value={`${result.summary.inputRecordCount} / ${result.summary.outputRecordCount}`}
              />
              <Metric label="Eligible" value={String(result.summary.eligibleRecordCount)} />
              <Metric label="Measured records" value={String(result.summary.measuredRecordCount)} />
              <Metric
                label="Estimated records"
                value={String(result.summary.estimatedRecordCount)}
              />
              <Metric
                label="Not evaluated"
                value={String(result.summary.notEvaluatedRecordCount)}
              />
              <Metric
                label="Warnings / blocking"
                value={`${result.summary.warningCount} / ${result.summary.blockingCount}`}
              />
              <Metric label="Governance status" value={status} />
            </div>
          </section>
          <section aria-labelledby="chart-title" className="rounded-xl border p-4">
            <h2 id="chart-title" className="text-xl font-semibold">
              5. Measured and estimated review
            </h2>
            <div className="flex flex-wrap gap-3">
              <label>
                Variable{" "}
                <select
                  aria-label="Irradiance chart variable"
                  value={variable}
                  onChange={(event) => setVariable(event.target.value as typeof variable)}
                >
                  <option>ghi</option>
                  <option>dni</option>
                  <option>dhi</option>
                  <option>clearnessIndex</option>
                </select>
              </label>
              <label>
                Origin{" "}
                <select
                  aria-label="Origin filter"
                  value={originFilter}
                  onChange={(event) => setOriginFilter(event.target.value)}
                >
                  <option>All</option>
                  <option>Measured</option>
                  <option>Estimated</option>
                </select>
              </label>
              <label>
                From{" "}
                <input
                  aria-label="Chart from"
                  type="datetime-local"
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                />
              </label>
              <label>
                To{" "}
                <input
                  aria-label="Chart to"
                  type="datetime-local"
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                />
              </label>
              <button onClick={() => setChartLimit((value) => Math.max(24, Math.floor(value / 2)))}>
                Zoom in
              </button>
              <button
                onClick={() => {
                  setRangeStart("");
                  setRangeEnd("");
                  setChartLimit(720);
                }}
              >
                Reset chart
              </button>
            </div>
            {chartRecords.length ? (
              <svg
                role="img"
                aria-label={`${variable} measured versus estimated chart with ${chartRecords.length} displayed points`}
                viewBox="0 0 720 180"
                className="mt-3 w-full border"
              >
                {chartRecords.map((record, index) => {
                  const value =
                    variable === "clearnessIndex"
                      ? record.clearnessIndex
                      : record[
                          `output${variable[0].toUpperCase()}${variable.slice(1)}` as
                            "outputGhi" | "outputDni" | "outputDhi"
                        ];
                  const origin =
                    variable === "clearnessIndex"
                      ? "Derived"
                      : record[`${variable}Origin` as "ghiOrigin" | "dniOrigin" | "dhiOrigin"];
                  return value === null ? (
                    <path
                      key={`${record.sourceRow}-missing`}
                      data-state="not-evaluated"
                      d={`M ${index * 10} 165 l 5 -5`}
                      stroke="gray"
                    />
                  ) : (
                    <circle
                      key={record.sourceRow}
                      cx={(index / Math.max(1, chartRecords.length - 1)) * 710 + 5}
                      cy={165 - Math.min(150, Math.abs(value) / 8)}
                      r="3"
                      fill={
                        origin === "Measured"
                          ? "#2563eb"
                          : origin === "Estimated"
                            ? "#f97316"
                            : "#16a34a"
                      }
                      data-origin={origin}
                    />
                  );
                })}
              </svg>
            ) : (
              <p role="status">No data in the selected range or origin filter.</p>
            )}
            <p>
              Blue: Measured · Orange: Estimated · Green: Derived · Grey: Not evaluated. Display
              aggregation is not authoritative calculation data.
            </p>
          </section>
          <section aria-labelledby="aggregate-title" className="rounded-xl border p-4">
            <h2 id="aggregate-title" className="text-xl font-semibold">
              6. Aggregate review
            </h2>
            <h3 className="mt-3 font-semibold">Daily component totals</h3>
            <p>Aggregated display data in kWh/m²; only complete, evaluated intervals are summed.</p>
            {aggregates.days.length ? (
              <ul aria-label="Daily component totals">
                {aggregates.days.slice(0, 31).map(([day, value]) => (
                  <li key={day}>
                    {day}: GHI {(value.ghi / 1000).toFixed(3)}, DNI {(value.dni / 1000).toFixed(3)},
                    DHI {(value.dhi / 1000).toFixed(3)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No mathematically valid daily totals.</p>
            )}
            <h3 className="mt-3 font-semibold">Monthly completeness</h3>
            <ul aria-label="Monthly completeness">
              {aggregates.months.map(([month, value]) => (
                <li key={month}>
                  {month}: {value.evaluated}/{value.total} evaluated (
                  {((value.evaluated / Math.max(1, value.total)) * 100).toFixed(1)}%)
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="records-title" className="rounded-xl border p-4">
            <h2 id="records-title" className="text-xl font-semibold">
              7. Component records and findings
            </h2>
            <div className="max-h-72 overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>GHI</th>
                    <th>DNI</th>
                    <th>DHI</th>
                    <th>Origins</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.records.slice(0, 200).map((record) => (
                    <tr key={record.sourceRow}>
                      <td>{record.timestamp}</td>
                      <td>{record.outputGhi ?? "Not evaluated"}</td>
                      <td>{record.outputDni ?? "Not evaluated"}</td>
                      <td>{record.outputDhi ?? "Not evaluated"}</td>
                      <td>
                        {record.ghiOrigin} / {record.dniOrigin} / {record.dhiOrigin}
                      </td>
                      <td>
                        {record.calculationStatus}
                        {record.notEvaluatedReason ? `: ${record.notEvaluatedReason}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-3 font-semibold">Findings over time</h3>
            <p>{result.findings.length} findings.</p>
            <ul aria-label="Findings over time">
              {result.findings.slice(0, 200).map((finding) => (
                <li key={finding.id}>
                  {finding.timestamp ?? "Study"} · {finding.code} · {finding.explanation}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="governance-title" className="rounded-xl border p-4">
            <h2 id="governance-title" className="text-xl font-semibold">
              8. Governance and deterministic exports
            </h2>
            <label>
              Reviewer{" "}
              <input
                aria-label="Reviewer"
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value)}
              />
            </label>
            <label className="ml-3">
              Engineering note{" "}
              <textarea
                aria-label="Engineering note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => transition("Reviewed")}>Mark study reviewed</button>
              <button onClick={() => transition("Approved for preliminary transposition")}>
                Approve for preliminary transposition
              </button>
              <button onClick={() => transition("Rejected")}>Reject study</button>
              {(["review", "components", "findings", "summary", "companion"] as const).map(
                (kind) => (
                  <button key={kind} onClick={() => download(kind)}>
                    <Download size={15} className="inline" /> Export {kind}
                  </button>
                ),
              )}
            </div>
            <ol>
              {history.map((item) => (
                <li key={item.sequence}>
                  {item.timestamp}: {item.from} → {item.to} by {item.reviewer}; {item.note}
                </li>
              ))}
            </ol>
            <h3 className="mt-3 font-semibold">Assumptions</h3>
            <ul className="list-disc pl-6">
              {assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3 className="mt-3 font-semibold">Limitations</h3>
            <ul className="list-disc pl-6">
              {limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </>
      )}
      <button className="rounded border px-4 py-2 focus-visible:ring-2" onClick={startOver}>
        Start over
      </button>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
