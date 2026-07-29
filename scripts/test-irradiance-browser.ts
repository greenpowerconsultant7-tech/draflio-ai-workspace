import assert from "node:assert/strict";
import { chromium } from "playwright";
import { calculateIrradiance } from "../shared/renewableEnergy/irradiance/irradianceCore";
import {
  WEATHER_PARSER_VERSION,
  WEATHER_SCHEMA,
  WEATHER_SCHEMA_VERSION,
  WEATHER_STAGE,
  WEATHER_VALIDATION_VERSION,
  type WeatherReviewRecord,
} from "../shared/renewableEnergy/weather/weatherTypes";

type Result = {
  item: number;
  requirement: string;
  browserAction: string;
  runtimeAssertion: string;
  observedEvidence: string;
  status: "Pass" | "Fail";
};
const report: Result[] = [];
const record = (
  requirement: string,
  browserAction: string,
  runtimeAssertion: string,
  observedEvidence: string,
  passed: boolean,
) =>
  report.push({
    item: report.length + 1,
    requirement,
    browserAction,
    runtimeAssertion,
    observedEvidence,
    status: passed ? "Pass" : "Fail",
  });
const weather = (status: WeatherReviewRecord["status"]): WeatherReviewRecord => ({
  schema: WEATHER_SCHEMA,
  schemaVersion: WEATHER_SCHEMA_VERSION,
  calculationStage: WEATHER_STAGE,
  dataset: {
    datasetId: "=browser weather",
    project: { projectId: "browser-solar", projectName: "Browser solar" },
    versions: [
      {
        version: 1,
        createdAt: "2024-03-20T00:00:00.000Z",
        source: {
          projectId: "browser-solar",
          sourceId: "browser-source",
          filename: "@irradiance weather.csv",
          format: "draflio-csv",
          mimeType: "text/csv",
          byteSize: 100,
          sourceHash: "sha256:browser",
          importedAt: "2024-03-20T00:00:00.000Z",
          originalHeaderMetadata: {},
          declaredLocation: "Equator",
          latitude: 0,
          longitude: 0,
          elevationMetres: 0,
          timezone: { kind: "fixed-offset", value: "+00:00", offsetMinutes: 0 },
          sourceProvider: "browser fixture",
          sourcePeriod: "2024-03-20",
          interval: { minutes: 60, basis: "declared", confidence: 1 },
          sourceUnits: { ghi: "W/m²", dni: "W/m²", dhi: "W/m²" },
          parserVersion: WEATHER_PARSER_VERSION,
          validationVersion: WEATHER_VALIDATION_VERSION,
          notes: "",
          reviewStatus: status,
          originalText: "timestamp,GHI\n2024-03-20T12:00:00Z,800",
        },
        records: [
          {
            timestamp: "2024-03-20T12:00:00.000Z",
            timezone: "+00:00",
            sourceRow: 2,
            values: { ghi: 800, dni: null, dhi: null },
            qualityFlags: [],
            conversionStatus: [],
          },
          {
            timestamp: "2024-03-20T13:00:00.000Z",
            timezone: "+00:00",
            sourceRow: 3,
            values: { ghi: 700, dni: 500, dhi: 220 },
            qualityFlags: [],
            conversionStatus: [],
          },
          {
            timestamp: "2024-03-20T00:00:00.000Z",
            timezone: "+00:00",
            sourceRow: 4,
            values: { ghi: 0, dni: null, dhi: null },
            qualityFlags: [],
            conversionStatus: [],
          },
        ],
        findings: [],
        summary: null,
      },
    ],
  },
  currentVersion: 1,
  status,
  history: [],
  limitations: [],
});
const approved = weather("Approved for preliminary modelling");
const nativeResult = calculateIrradiance(approved, {
  modelId: "erbs-hourly",
  modelVersion: "1982-1.0",
  lowSunElevationDegrees: 5,
  reconciliationToleranceWattsPerSquareMetre: 5,
});
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});
await context.addInitScript(() => {
  const lifecycle = { created: [] as string[], revoked: [] as string[], storage: 0 };
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    lifecycle.created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    lifecycle.revoked.push(url);
    revoke(url);
  };
  for (const storage of [localStorage, sessionStorage])
    for (const method of ["setItem", "removeItem", "clear"] as const) {
      const original = storage[method].bind(storage);
      try {
        Object.defineProperty(storage, method, {
          value: (...args: string[]) => {
            lifecycle.storage += 1;
            return (original as (...values: string[]) => void)(...args);
          },
        });
      } catch {
        // Chromium may expose non-configurable Storage methods.
      }
    }
  Object.assign(window, { __irradianceLifecycle: lifecycle });
});
const page = await context.newPage();
const errors: string[] = [];
const external: string[] = [];
let workersCreated = 0;
let workersClosed = 0;
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("worker", (worker) => {
  workersCreated += 1;
  worker.on("close", () => (workersClosed += 1));
});
page.on("request", (request) => {
  const host = new URL(request.url()).hostname;
  if (!["127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))
    external.push(request.url());
});
const setReview = async (review: WeatherReviewRecord, name: string) =>
  page.locator('input[type="file"][accept*=".json"]').setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(review)),
  });
try {
  const portal = await page.goto("http://127.0.0.1:8080/renewable-energy/solar", {
    waitUntil: "networkidle",
  });
  record(
    "Solar portal entry",
    "Open Solar portal.",
    "HTTP 200 and Irradiance card.",
    `HTTP ${portal?.status()}`,
    portal?.status() === 200 && (await page.getByText("Irradiance Decomposition").count()) > 0,
  );
  await page.getByText("Irradiance Decomposition").first().click();
  await page.getByRole("heading", { name: "Solar irradiance decomposition" }).waitFor();
  record(
    "Integrated workspace",
    "Activate Irradiance Decomposition.",
    "Real Solar route renders.",
    page.url(),
    page.url().endsWith("/renewable-energy/solar/irradiance"),
  );
  const refresh = await page.reload({ waitUntil: "networkidle" });
  record(
    "Direct route refresh",
    "Reload direct route.",
    "HTTP 200.",
    `HTTP ${refresh?.status()}`,
    refresh?.status() === 200,
  );
  record(
    "Hydration",
    "Inspect hydrated route.",
    "One H1 and no hydration error.",
    `H1=${await page.locator("h1").count()}`,
    (await page.locator("h1").count()) === 1,
  );
  await setReview(weather("Imported"), "unapproved.json");
  const unapproved = await page.getByRole("alert").innerText();
  record(
    "Unapproved source rejection",
    "Import unapproved RE8A review.",
    "Visible rejection.",
    unapproved,
    /must be approved/i.test(unapproved),
  );
  await setReview(weather("Stale"), "stale.json");
  const staleSource = await page.getByRole("alert").innerText();
  record(
    "Stale source rejection",
    "Import stale RE8A review.",
    "Visible stale rejection.",
    staleSource,
    /Stale RE8A/i.test(staleSource),
  );
  const mismatch = structuredClone(approved);
  mismatch.dataset.versions[0].source.projectId = "other";
  await setReview(mismatch, "cross-project.json");
  const cross = await page.getByRole("alert").innerText();
  record(
    "Cross-project rejection",
    "Import mismatched project/version review.",
    "Deep weather validation rejects it.",
    cross,
    /Cross-project/i.test(cross),
  );
  await setReview(approved, "approved.json");
  await page.getByText("2. Model eligibility and configuration").waitFor();
  record(
    "Approved RE8A source import",
    "Import approved review through UI.",
    "Project and source version visible.",
    await page.locator("main").innerText(),
    (await page.getByText("browser-solar").count()) > 0,
  );
  record(
    "Source version and status",
    "Inspect governed input metrics.",
    "Version 1 and approved state visible.",
    await page.locator("main").innerText(),
    (await page.getByText("Approved for preliminary modelling").count()) > 0,
  );
  record(
    "Measured-variable availability",
    "Inspect GHI/DNI/DHI counts.",
    "Availability metrics render.",
    `metrics=${await page.getByText(/measured \/ missing/).count()}`,
    (await page.getByText(/measured \/ missing/).count()) === 3,
  );
  await page.getByLabel("Decomposition model").selectOption("erbs-hourly");
  record(
    "Model selection",
    "Select Erbs model.",
    "Selected value is explicit.",
    await page.getByLabel("Decomposition model").inputValue(),
    (await page.getByLabel("Decomposition model").inputValue()) === "erbs-hourly",
  );
  const modelText = await page.locator("main").innerText();
  record(
    "Model version/reference",
    "Inspect model definition.",
    "Erbs version and literature visible.",
    modelText,
    modelText.includes("1982-1.0") && modelText.includes("Erbs, Klein and Duffie"),
  );
  record(
    "Model limitation display",
    "Inspect limitations.",
    "Low-sun/empirical limitations visible.",
    modelText,
    /empirical/i.test(modelText) && /low sun/i.test(modelText),
  );
  record(
    "Eligibility display",
    "Inspect eligibility.",
    "Eligible state visible.",
    modelText,
    modelText.includes("Eligibility: Eligible"),
  );
  await page.getByRole("button", { name: "Start calculation" }).click();
  await page.getByText("4. Irradiance summary").waitFor();
  record(
    "Calculation start",
    "Click actual Start calculation.",
    "Summary reached through production worker.",
    `workers=${workersCreated}`,
    workersCreated > 0,
  );
  record(
    "Progress",
    "Observe progress control.",
    "Progress reaches 100.",
    String(await page.getByLabel("Irradiance calculation progress").getAttribute("value")),
    (await page.getByLabel("Irradiance calculation progress").getAttribute("value")) === "100",
  );
  const text = await page.locator("main").innerText();
  record(
    "Measured-value preservation",
    "Inspect measured table record.",
    "Measured 700/500/220 retained.",
    text,
    text.includes("700") && text.includes("500") && text.includes("220"),
  );
  record(
    "Estimated-origin labels",
    "Inspect first calculated row.",
    "Estimated origins visible.",
    text,
    text.includes("Measured / Estimated / Estimated"),
  );
  record(
    "Not-evaluated records",
    "Inspect night record.",
    "Night remains Not evaluated.",
    text,
    text.includes("SUN_BELOW_HORIZON"),
  );
  record(
    "Component reconciliation",
    "Inspect summary/findings.",
    "Reconciliation count is explicit.",
    text,
    text.includes("Warnings / blocking"),
  );
  record(
    "Summary reconciliation",
    "Inspect input/output metric.",
    "3 inputs reconcile to 3 outputs.",
    text,
    text.includes("3 / 3"),
  );
  await page.getByLabel("Irradiance chart variable").selectOption("dni");
  record(
    "Measured-versus-estimated chart",
    "Inspect SVG origins.",
    "Measured and estimated points render.",
    `measured=${await page.locator('[data-origin="Measured"]').count()} estimated=${await page.locator('[data-origin="Estimated"]').count()}`,
    (await page.locator('[data-origin="Measured"]').count()) > 0 &&
      (await page.locator('[data-origin="Estimated"]').count()) > 0,
  );
  await page.getByLabel("Irradiance chart variable").selectOption("clearnessIndex");
  record(
    "Clearness-index chart",
    "Select clearnessIndex.",
    "Derived chart renders.",
    (await page.getByRole("img").getAttribute("aria-label")) ?? "",
    (await page.getByRole("img").getAttribute("aria-label"))?.includes("clearnessIndex") === true,
  );
  await page.getByLabel("Chart from").fill("2030-01-01T00:00");
  record(
    "No-data state",
    "Set range outside data.",
    "No-data status visible.",
    await page.getByRole("status").innerText(),
    /No data/.test(await page.getByRole("status").innerText()),
  );
  await page.getByRole("button", { name: "Reset chart" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  record(
    "Date controls and zoom/reset",
    "Operate date, reset, and zoom controls.",
    "Chart returns and remains operable.",
    (await page.getByRole("img").getAttribute("aria-label")) ?? "",
    (await page.getByRole("img").count()) === 1,
  );
  await page.getByLabel("Origin filter").selectOption("Estimated");
  record(
    "Measured/estimated filtering",
    "Filter Estimated.",
    "Only matching display points retained.",
    `measured=${await page.locator('[data-origin="Measured"]').count()}`,
    (await page.locator('[data-origin="Measured"]').count()) === 0,
  );
  await page.getByLabel("Origin filter").selectOption("All");
  await page.getByRole("button", { name: "Start calculation" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  const cancelledText = await page.getByRole("alert").innerText();
  record(
    "Calculation cancellation",
    "Start then cancel through actual UI controls.",
    "Cancelled state is explicit.",
    cancelledText,
    /cancelled/i.test(cancelledText),
  );
  await page.waitForTimeout(20);
  record(
    "No partial result after cancellation",
    "Wait after cancellation.",
    "No quality summary is accepted.",
    `summary=${await page.getByText("4. Irradiance summary").count()}`,
    (await page.getByText("4. Irradiance summary").count()) === 0,
  );
  await page.getByRole("button", { name: "Start calculation" }).click();
  await page.getByText("4. Irradiance summary").waitFor();
  await page.getByLabel("Reviewer").fill("Browser engineer");
  await page.getByLabel("Engineering note").fill("Reviewed decomposition evidence");
  await page.getByRole("button", { name: "Mark study reviewed" }).click();
  record(
    "Governance review transition",
    "Enter reviewer/note and mark reviewed.",
    "Reviewed status/history visible.",
    await page.locator("main").innerText(),
    (await page.getByText("Reviewed", { exact: true }).count()) > 0,
  );
  await page.getByLabel("Engineering note").fill("Approved only for preliminary transposition");
  await page.getByRole("button", { name: "Approve for preliminary transposition" }).click();
  record(
    "Explicit preliminary-transposition approval",
    "Activate explicit approval.",
    "Approval status visible.",
    await page.locator("main").innerText(),
    (await page.getByText("Approved for preliminary transposition", { exact: true }).count()) > 0,
  );
  const downloads: Array<{ name: string; text: string }> = [];
  for (const kind of ["review", "components", "findings", "summary", "companion"]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: `Export ${kind}` }).click();
    const download = await event;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    downloads.push({
      name: download.suggestedFilename(),
      text: Buffer.concat(chunks).toString("utf8"),
    });
  }
  record(
    "All deterministic exports",
    "Download five production exports.",
    "Five readable browser downloads.",
    downloads.map((item) => item.name).join(", "),
    downloads.length === 5 && downloads.every((item) => item.text.length > 0),
  );
  const components = downloads.find((item) => item.name.includes("components"))!;
  record(
    "Formula neutralisation",
    "Inspect downloaded component CSV.",
    "Formula-prefixed timezone is neutralised.",
    components.text,
    components.text.includes("'+00:00"),
  );
  record(
    "Stable component columns",
    "Inspect downloaded header.",
    "Required stable columns present.",
    components.text.split(/\r?\n/)[0],
    components.text.startsWith("timestamp,timezone,source_row,solar_elevation_deg"),
  );
  record(
    "Missing values preserved",
    "Inspect CSV missing component inputs.",
    "Missing input fields remain empty.",
    components.text,
    components.text.includes(",,"),
  );
  record(
    "Filename safety",
    "Inspect suggested filenames.",
    "Unsafe dataset prefix is sanitised.",
    downloads.map((item) => item.name).join(", "),
    downloads.every((item) => !/[=@+]/.test(item.name)),
  );
  await page.waitForTimeout(20);
  let lifecycle = await page.evaluate(
    () =>
      (
        window as unknown as {
          __irradianceLifecycle: { created: string[]; revoked: string[]; storage: number };
        }
      ).__irradianceLifecycle,
  );
  record(
    "Object-URL lifecycle",
    "Wait next macrotask after repeated exports.",
    "Every created URL revoked.",
    `created=${lifecycle.created.length} revoked=${lifecycle.revoked.length}`,
    lifecycle.created.length === 5 && lifecycle.revoked.length === 5,
  );
  await page.getByLabel("Decomposition model").selectOption("measured-pass-through");
  const mutatedText = await page.locator("main").innerText();
  record(
    "Mutation makes approval stale",
    "Change selected model.",
    "Approval invalidated and result cleared.",
    mutatedText,
    mutatedText.includes("Eligibility: Stale") &&
      (await page.getByText("4. Irradiance summary").count()) === 0,
  );
  await setReview(approved, "controlled.json");
  await page.getByText("2. Model eligibility and configuration").waitFor();
  const controlled = `(() => {
    const original = window.Worker;
    const workers = [];
    class ControlledWorker {
      constructor() { this.onmessage = null; this.onerror = null; this.requests = []; this.terminated = 0; workers.push(this); }
      postMessage(message) { this.requests.push(structuredClone(message)); }
      terminate() { this.terminated += 1; }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    }
    window.Worker = ControlledWorker;
    window.__irradianceControlled = {
      workers,
      dispatch(index, data) { workers[index]?.onmessage?.(new MessageEvent("message", { data })); },
      restore() { window.Worker = original; delete window.__irradianceControlled; }
    };
  })()`;
  await page.evaluate(controlled);
  const state = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          __irradianceControlled: {
            workers: Array<{ requests: Array<{ generation: number }>; terminated: number }>;
          };
        }
      ).__irradianceControlled.workers.map((worker) => ({
        generation: worker.requests[0]?.generation,
        terminated: worker.terminated,
      })),
    );
  const dispatch = (index: number, data: unknown) =>
    page.evaluate(
      ({ index, data }) =>
        (
          window as unknown as {
            __irradianceControlled: { dispatch(index: number, data: unknown): void };
          }
        ).__irradianceControlled.dispatch(index, data),
      { index, data },
    );
  await page.getByRole("button", { name: "Start calculation" }).click();
  await page.getByRole("button", { name: "Start calculation" }).click();
  let controlledState = await state();
  const generationA = controlledState[0].generation;
  const generationB = controlledState[1].generation;
  await dispatch(1, {
    type: "progress",
    generation: generationA,
    percent: 99,
    stage: "stale progress",
  });
  record(
    "Stale progress",
    "Start A then B; dispatch A progress to B handler.",
    "99% and stale text ignored.",
    `A=${generationA} B=${generationB} progress=${await page.getByLabel("Irradiance calculation progress").getAttribute("value")}`,
    (await page.getByLabel("Irradiance calculation progress").getAttribute("value")) !== "99" &&
      !(await page.locator("main").innerText()).includes("stale progress"),
  );
  await dispatch(1, { type: "success", generation: generationA, result: nativeResult });
  record(
    "Stale success",
    "Dispatch valid A success through B handler.",
    "No summary/export accepted.",
    `summary=${await page.getByText("4. Irradiance summary").count()}`,
    (await page.getByText("4. Irradiance summary").count()) === 0,
  );
  await dispatch(1, { type: "error", generation: generationA, message: "stale error" });
  const beforeB = await page.locator("main").innerText();
  await dispatch(1, { type: "success", generation: generationB, result: nativeResult });
  await page.getByText("4. Irradiance summary").waitFor();
  record(
    "Stale error",
    "Dispatch A error then valid B success.",
    "Stale error absent and B completes.",
    `B=${generationB}`,
    !beforeB.includes("stale error") &&
      (await page.getByText("4. Irradiance summary").count()) === 1,
  );
  await page.getByRole("button", { name: "Start calculation" }).click();
  controlledState = await state();
  const generationC = controlledState[2].generation;
  const malformed = structuredClone(nativeResult);
  Object.assign(malformed.summary, { warningCount: "malformed" });
  await dispatch(2, { type: "success", generation: generationC, result: malformed });
  await page.getByText("Malformed irradiance worker result rejected.").waitFor();
  record(
    "Malformed current success",
    "Dispatch nested malformed C success.",
    "Rejected, terminated, no partial summary/export.",
    `C=${generationC} terminated=${(await state())[2].terminated}`,
    (await state())[2].terminated === 1 &&
      (await page.getByText("4. Irradiance summary").count()) === 0,
  );
  await page.evaluate(() =>
    (
      window as unknown as { __irradianceControlled: { restore(): void } }
    ).__irradianceControlled.restore(),
  );
  await page.getByRole("button", { name: "Start over" }).click();
  record(
    "Start-over cleanup",
    "Activate Start over.",
    "Imported and result state removed.",
    `model=${await page.getByText("2. Model eligibility and configuration").count()}`,
    (await page.getByText("2. Model eligibility and configuration").count()) === 0,
  );
  let focusEvidence = "";
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    focusEvidence = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element);
      return `${style.outlineStyle}|${style.boxShadow}`;
    });
    if (!focusEvidence.startsWith("none|") || !focusEvidence.endsWith("none")) break;
  }
  record(
    "Keyboard accessibility and visible focus",
    "Tab through controls.",
    "Focused control has visible outline or focus ring.",
    focusEvidence,
    !focusEvidence.startsWith("none|") || !focusEvidence.endsWith("none"),
  );
  record(
    "Screen-reader labels",
    "Query labelled controls.",
    "File input and Start over accessible.",
    `buttons=${await page.getByRole("button").count()}`,
    (await page.getByRole("button", { name: "Start over" }).count()) === 1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  record(
    "Responsive layout",
    "Set narrow viewport.",
    "No document overflow.",
    `overflow=${overflow}`,
    !overflow,
  );
  record(
    "No network transmission",
    "Capture request hosts.",
    "No imported data leaves browser.",
    `external=${external.length}`,
    external.length === 0,
  );
  lifecycle = await page.evaluate(
    () =>
      (
        window as unknown as {
          __irradianceLifecycle: { created: string[]; revoked: string[]; storage: number };
        }
      ).__irradianceLifecycle,
  );
  record(
    "No browser persistence",
    "Instrument storage mutations.",
    "No persistence call.",
    `storage=${lifecycle.storage}`,
    lifecycle.storage === 0,
  );
  record(
    "Clean console",
    "Capture console/page errors.",
    "No runtime error.",
    errors.join(" | ") || "No errors.",
    errors.length === 0,
  );
  record(
    "Worker and resource cleanup",
    "Inspect worker close events and restored API.",
    "Workers close and test Worker restored.",
    `created=${workersCreated} closed=${workersClosed}`,
    workersCreated === workersClosed,
  );
} catch (error) {
  record(
    "Continue direct-runtime browser sequence",
    "Execute browser workflow.",
    "Browser action completes.",
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    false,
  );
} finally {
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
assert.equal(
  report.some((item) => item.status === "Fail"),
  false,
  "Irradiance browser acceptance failed.",
);
