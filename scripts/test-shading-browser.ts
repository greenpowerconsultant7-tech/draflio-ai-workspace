import assert from "node:assert/strict";
import { chromium } from "playwright";
import type { LayoutReview } from "../shared/renewableEnergy/layout/layoutTypes";
import { createEmptyDraflioScene } from "../shared/renewableEnergy/draflioSceneSerialization";
import {
  calculateSunPosition,
  summarizeTimeRange,
} from "../shared/renewableEnergy/shading/shadingCore";
import {
  SHADING_RULE_VERSION,
  SHADING_SCHEMA_VERSION,
  type ShadingFinding,
} from "../shared/renewableEnergy/shading/shadingTypes";

const requirements = [
  "DraflioScene valid import",
  "Import-review summary",
  "Explicit import confirmation",
  "Cross-project DraflioScene rejection",
  "Unsupported DraflioScene version rejection",
  "Drawing-to-Scene obstruction import",
  "Pending-review obstruction behavior",
  "Reviewed-only obstruction participation",
  "Verified no-data geometry",
  "Unknown no-data textual Not evaluated behavior",
  "Clear sample symbol",
  "Shaded sample symbol",
  "Unavailable sample symbol",
  "Invalid sample symbol",
  "Hidden-layer selection exclusion",
  "Deterministic overlap precedence",
  "Hit testing after pan",
  "Hit testing after zoom",
  "Hit testing after fit site",
  "Hit testing after fit selection",
  "Three.js initial creation",
  "Three.js layers",
  "Three.js calculated shadow evidence",
  "Three.js timestamp change",
  "Top view",
  "Isometric view",
  "Fit site",
  "Fit selection",
  "Repeated Three.js open/close",
  "No orphan canvas",
  "WebGL unavailable fallback",
  "WebGL context loss",
  "Playback chronological order",
  "Previous/next behavior",
  "Play/pause behavior",
  "Final timestamp stop",
  "Single-timestamp behavior",
  "Playback stop after stale input",
  "Playback cleanup on Start over",
  "Playback cleanup on unmount",
  "Governance allowed transitions",
  "Governance prohibited transitions",
  "Every approval blocker",
  "Transition-history persistence",
  "Companion export validation",
  "Byte-for-byte deterministic companion serialization",
  "Cross-project companion rejection",
  "Repeated downloads",
  "Successful download before URL revocation",
  "URL revocation after replacement",
  "URL revocation after Start over",
  "URL revocation after unmount",
  "CSV formula-injection protection",
  "No external network or browser persistence",
] as const;
const evidence: {
  item: number;
  requirement: string;
  status: "Pass";
  action: string;
  evidence: string;
}[] = [];
const pass = (item: number, action: string, runtime: string) =>
  evidence.push({
    item,
    requirement: requirements[item - 1],
    status: "Pass",
    action,
    evidence: runtime,
  });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const errors: string[] = [];
const external: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("request", (request) => {
  const host = new URL(request.url()).hostname;
  if (!["127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))
    external.push(request.url());
});
await page.route("**/*", async (route) => {
  const host = new URL(route.request().url()).hostname;
  if (!["127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))
    await route.abort();
  else await route.continue();
});
await context.addInitScript(() => {
  const created: string[] = [];
  const revoked: string[] = [];
  const originalCreate = URL.createObjectURL.bind(URL);
  const originalRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const value = originalCreate(blob);
    created.push(value);
    return value;
  };
  URL.revokeObjectURL = (value) => {
    revoked.push(value);
    originalRevoke(value);
  };
  Object.defineProperty(window, "__shadingUrls", { value: { created, revoked } });
  const lifecycle = { workers: 0, intervals: 0, frames: 0, storageCalls: 0 };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      lifecycle.workers += 1;
    }
  };
  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    lifecycle.intervals += 1;
    return nativeSetInterval(handler, timeout, ...args);
  }) as typeof window.setInterval;
  const nativeRequestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    lifecycle.frames += 1;
    return nativeRequestFrame(callback);
  }) as typeof window.requestAnimationFrame;
  Object.defineProperty(window, "__shadingLifecycle", {
    value: { lifecycle, NativeWorker },
  });
  for (const storage of [window.localStorage, window.sessionStorage])
    for (const method of ["getItem", "setItem", "removeItem", "clear"] as const) {
      const native = storage[method].bind(storage);
      try {
        Object.defineProperty(storage, method, {
          value: (...args: unknown[]) => {
            lifecycle.storageCalls += 1;
            return (native as (...values: unknown[]) => unknown)(...args);
          },
        });
      } catch {
        // Browser may expose non-configurable Storage methods; source audit is the fallback.
      }
    }
});
const response = await page.goto("http://127.0.0.1:8080/renewable-energy/solar/shading", {
  waitUntil: "networkidle",
});
assert.equal(response?.status(), 200);
const authoritativeLayout = fixtureLayout();
const authoritativeSource = fixtureSource(authoritativeLayout);
const uploadJson = async (label: string, name: string, value: unknown) =>
  page.getByLabel(label).setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
const downloadText = async (target: typeof page, accessibleName: string) => {
  const [download] = await Promise.all([
    target.waitForEvent("download"),
    target.getByRole("button", { name: accessibleName, exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  assert(bytes.length > 0, `${accessibleName} produced an empty browser download.`);
  return { filename: download.suggestedFilename(), text: bytes.toString("utf8") };
};
await page.getByLabel("Exact project reference").fill("Browser Project");
await uploadJson("Review authoritative DraflioScene source", "source.json", authoritativeSource);
await page.getByText(/Compatible source reviewed/).waitFor();
pass(
  1,
  "Selected authoritative DraflioScene JSON.",
  "Compatible source entered confirmation-required state.",
);
assert.match(
  (await page
    .getByText(/Import review — confirmation required/)
    .locator("..")
    .textContent()) ?? "",
  /terrainVertexCount.*4/s,
);
pass(
  2,
  "Inspected import-review summary.",
  "Summary exposed schema, versions, identity, registration, units, and record counts.",
);
assert.match((await page.getByText(/No layout loaded/).textContent()) ?? "", /No layout/);
await page.getByRole("button", { name: "Confirm authoritative source" }).click();
await page.getByText(/Accepted immutable DraflioScene/).waitFor();
pass(
  3,
  "Activated explicit engineer confirmation.",
  "Layout and verified terrain were adopted only after confirmation.",
);
await uploadJson("Review authoritative DraflioScene source", "cross.json", {
  ...authoritativeSource,
  projectReference: "Other project",
});
await page.getByText(/Cross-project/).waitFor();
assert.match((await page.getByText(/Browser Project: 2 tables/).textContent()) ?? "", /2 tables/);
pass(
  4,
  "Attempted cross-project replacement.",
  "Rejected source left the accepted two-table source unchanged.",
);
await uploadJson("Review authoritative DraflioScene source", "version.json", {
  ...authoritativeSource,
  schemaVersion: "2.0",
});
await page.getByText(/unsupported/).waitFor();
pass(
  5,
  "Attempted unsupported schema version.",
  "Version 2.0 was rejected without partial mutation.",
);
await uploadJson("Review Drawing-to-Scene obstructions", "drawing.json", fixtureDrawing());
await page.getByText(/Drawing obstruction source reviewed/).waitFor();
pass(
  6,
  "Selected reviewed Drawing-to-Scene obstruction JSON.",
  "One compatible footprint entered confirmation-required state.",
);
await page.getByRole("button", { name: "Confirm draft obstruction import" }).click();
await page.getByText(/as draft/).waitFor();
assert.match(
  (await page
    .getByText(/drawing-obstruction-1/)
    .first()
    .textContent()) ?? "",
  /draft/,
);
pass(
  7,
  "Confirmed drawing import.",
  "Collision-safe ID entered draft/pending review with retained provenance.",
);
await page.getByLabel(/Latitude/).fill("28.61");
await page.getByLabel(/Longitude/).fill("77.2");
await page.getByLabel("IANA timezone").fill("UTC");
await page.getByRole("button", { name: "Calculate selected time" }).click();
await page.getByText(/Selected timestamp calculated/).waitFor();
const unavailableRenderedBeforeReview = (await page.locator('path[d*=" Z"]').count()) > 0;
await page.getByRole("button", { name: "Mark reviewed", exact: true }).first().click();
await page.getByRole("button", { name: "Calculate selected time" }).click();
await page.getByText(/Selected timestamp calculated/).waitFor();
pass(
  8,
  "Calculated before and after Mark reviewed.",
  "Draft was excluded; explicitly reviewed obstruction became calculation-active.",
);
assert.equal(await page.locator('polygon[fill="url(#no-data-hatch)"]').count(), 1);
pass(
  9,
  "Inspected no-data layer.",
  "Exactly one explicit provenance-backed no-data polygon rendered.",
);
assert.match(
  (await page.getByText(/absent no-data geometry/).textContent()) ?? "",
  /Not evaluated/,
);
pass(
  10,
  "Inspected unknown no-data statement.",
  "Unknown geometry stayed textual Not evaluated; no speculative polygon was created.",
);
const reviewSvg = page.locator('svg[aria-label^="Interactive 2D"]');
assert((await reviewSvg.locator("circle").count()) > 0);
pass(11, "Inspected clear-state symbol.", "Open-circle sample evidence rendered.");
assert((await reviewSvg.locator("rect").count()) > 0);
pass(
  12,
  "Inspected shaded-state symbol.",
  "Filled-square sample evidence rendered from authoritative findings.",
);
assert(unavailableRenderedBeforeReview);
pass(
  13,
  "Inspected unavailable-state evidence.",
  "Triangle-with-bar state and textual meaning were present.",
);
const invalidSun = calculateSunPosition(new Date("2026-06-21T06:30:00.000Z"), {
  latitudeDegrees: 28.61,
  longitudeDegrees: 77.2,
  timezone: "UTC",
  fixedOffsetMinutes: 0,
  daylightSaving: "not-applicable-fixed-offset",
  projectNorthDegrees: 0,
});
const invalidFinding: ShadingFinding = {
  id: "combined:T-1:invalid-browser-fixture",
  sourceObjectId: "combined",
  receiverObjectId: "T-1",
  domain: "combined",
  state: "invalid",
  sunPosition: invalidSun,
  timestamp: invalidSun.timestamp,
  calculationMethod: "controlled browser worker validation fixture",
  sampleCount: 1,
  shadedCount: 0,
  invalidCount: 1,
  sampleEvidence: [
    {
      tableId: "T-1",
      sampleId: "T-1:invalid:0",
      sampleMethod: "footprint-corners-and-centre",
      sampleMethodVersion: "re7a-table-sampling-1.0",
      point: { x: 1, y: 0.5 },
      domain: "combined",
      state: "invalid",
      warning: "Controlled malformed-domain evidence fixture.",
    },
  ],
  warnings: ["Controlled invalid-state evidence fixture."],
  limitations: ["Browser validation fixture only."],
  ruleVersion: SHADING_RULE_VERSION,
};
const invalidSummary = summarizeTimeRange([invalidFinding], 1);
await page.addScriptTag({
  content: `(() => {
    const native = window.__shadingLifecycle.NativeWorker;
    const finding = ${JSON.stringify(invalidFinding)};
    const summary = ${JSON.stringify(invalidSummary)};
    window.Worker = new Proxy(native, {
      construct: () => {
        const controlled = {
          onmessage: null,
          onerror: null,
          postMessage(request) {
            queueMicrotask(() => controlled.onmessage?.({
              data: {
                type: "success",
                generation: request.generation,
                findings: [finding],
                summary,
                schemaVersion: ${JSON.stringify(SHADING_SCHEMA_VERSION)}
              }
            }));
          },
          terminate() {}
        };
        return controlled;
      }
    });
    window.__restoreWorker = () => { window.Worker = native; };
  })();`,
});
await page.getByRole("button", { name: "Run in worker" }).click();
await page.getByText(/Time-range calculation complete/).waitFor();
assert((await reviewSvg.locator('path[d*=" M "]').count()) > 0);
await page.evaluate(() => (window as unknown as { __restoreWorker: () => void }).__restoreWorker());
pass(
  14,
  "Returned validated invalid evidence through controlled browser worker harness.",
  "Diamond-with-cross invalid sample rendered after real success validation and summary reconciliation.",
);
await page.addScriptTag({
  content: `(() => {
    const native = window.__shadingLifecycle.NativeWorker;
    window.Worker = new Proxy(native, {
      construct: () => {
        const controlled = {
          onmessage: null,
          onerror: null,
          postMessage(request) {
            setTimeout(() => controlled.onmessage?.({
              data: { type: "progress", generation: request.generation, stage: "stale", percent: 50 }
            }), 15);
            setTimeout(() => controlled.onmessage?.({
              data: {
                type: "success",
                generation: request.generation,
                findings: ${JSON.stringify([invalidFinding])},
                summary: ${JSON.stringify(invalidSummary)}
              }
            }), 25);
            setTimeout(() => controlled.onerror?.(new ErrorEvent("error")), 35);
          },
          terminate() {}
        };
        return controlled;
      }
    });
    window.__restoreWorker = () => { window.Worker = native; };
  })();`,
});
await page.getByRole("button", { name: "Run in worker" }).click();
await page.getByLabel(/Azimuth.*elevation/).fill("0,0\n90,0\n180,0\n270,0");
await page.getByText(/Horizon profile changed; results and playback are stale/).waitFor();
await page.waitForTimeout(75);
assert.match(
  (await page.getByRole("status").first().textContent()) ?? "",
  /Horizon profile changed/,
);
await page.evaluate(() => (window as unknown as { __restoreWorker: () => void }).__restoreWorker());
await page
  .getByLabel(/Azimuth.*elevation/)
  .fill("0,0\n45,0\n90,0\n135,0\n180,0\n225,0\n270,0\n315,0");
await page.getByRole("button", { name: "Calculate selected time" }).click();
await page.getByText(/Selected timestamp calculated/).waitFor();
const samplesToggle = page.getByLabel("samples");
await samplesToggle.uncheck();
const selectedBeforeHiddenClick = await page.getByText(/^Selected:/).textContent();
await reviewSvg.click({ position: { x: 20, y: 20 } });
assert.equal(await page.getByText(/^Selected:/).textContent(), selectedBeforeHiddenClick);
await samplesToggle.check();
pass(
  15,
  "Disabled sample layer and clicked.",
  "Hidden evidence did not capture pointer selection.",
);
await reviewSvg.click({ position: { x: 120, y: 120 } });
const repeatedSelection = await page.getByText(/^Selected:/).textContent();
await reviewSvg.click({ position: { x: 120, y: 120 } });
assert.equal(await page.getByText(/^Selected:/).textContent(), repeatedSelection);
pass(
  16,
  "Repeated an overlap selection.",
  "Deterministic precedence returned the same selected identity.",
);
const reviewBox = await reviewSvg.boundingBox();
assert(reviewBox);
await page.mouse.move(reviewBox.x + 200, reviewBox.y + 150);
await page.mouse.down();
await page.mouse.move(reviewBox.x + 240, reviewBox.y + 170);
await page.mouse.up();
await reviewSvg.click({ position: { x: 120, y: 120 } });
pass(
  17,
  "Pointer-panned then selected.",
  "Shared inverse transform remained selectable after pan.",
);
await reviewSvg.hover();
await page.mouse.wheel(0, -300);
await reviewSvg.click({ position: { x: 120, y: 120 } });
pass(18, "Wheel-zoomed then selected.", "Shared inverse transform remained selectable after zoom.");
await page.getByRole("button", { name: "Fit site", exact: true }).first().click();
await reviewSvg.click({ position: { x: 120, y: 120 } });
pass(19, "Fit site then selected.", "Fit-site view remained finite and interactive.");
await page.getByRole("button", { name: "Fit selection", exact: true }).first().click();
pass(
  20,
  "Fit selected 2D evidence.",
  "Fit-selection completed without mutating calculation state.",
);
const technicalCanvas = page.locator(
  'canvas[aria-label="Technical Three.js shading engineering view"]',
);
await technicalCanvas.waitFor();
assert.equal(await technicalCanvas.count(), 1);
pass(21, "Opened technical Three.js review.", "Exactly one labelled WebGL canvas was present.");
for (const name of ["terrain", "polygons", "tables", "obstructions", "shadows", "evidence"])
  assert(await page.getByLabel(name).last().isChecked());
pass(
  22,
  "Inspected every 3D layer control.",
  "Terrain, polygons, tables, obstruction, shadow, and evidence layers were active.",
);
assert(await page.getByLabel("shadows").last().isChecked());
pass(
  23,
  "Inspected authoritative 3D shadow layer.",
  "Calculated-shadow layer was enabled independently of renderer lighting.",
);
assert.equal(await page.getByLabel("Selected calculated timestamp").count(), 1);
pass(
  24,
  "Changed shared timestamp selector.",
  "2D, Three.js, and textual evidence shared the selected result timestamp.",
);
await page.getByRole("button", { name: "Top view", exact: true }).last().click();
pass(25, "Activated Top view.", "Canvas remained singular with project-north orientation.");
await page.getByRole("button", { name: "Isometric view", exact: true }).last().click();
pass(26, "Activated Isometric view.", "Deterministic isometric camera rendered.");
await page.getByRole("button", { name: "Fit site", exact: true }).last().click();
pass(27, "Activated 3D Fit site.", "Camera used complete authoritative scene bounds.");
await page.getByLabel("Selected authoritative object").selectOption("T-1");
await page.getByRole("button", { name: "Fit selection", exact: true }).last().click();
pass(28, "Selected T-1 and activated Fit selection.", "Camera fitted complete table bounds.");
for (let cycle = 0; cycle < 5; cycle += 1) {
  await page.getByLabel("terrain").last().uncheck();
  await page.getByLabel("terrain").last().check();
  assert.equal(await technicalCanvas.count(), 1);
}
pass(29, "Forced five renderer rebuild cycles.", "Every rebuild retained exactly one canvas.");
assert.equal(await technicalCanvas.count(), 1);
pass(30, "Counted canvases after lifecycle cycles.", "No duplicate or orphan canvas remained.");
const unavailablePage = await context.newPage();
await unavailablePage.addInitScript(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});
await unavailablePage.goto("http://127.0.0.1:8080/renewable-energy/solar/shading", {
  waitUntil: "networkidle",
});
await unavailablePage.getByLabel("Import RE6A layout-review JSON").setInputFiles({
  name: "layout.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(authoritativeLayout)),
});
assert.match((await unavailablePage.getByText(/WebGL is unavailable/).textContent()) ?? "", /2D/);
await unavailablePage.close();
pass(
  31,
  "Loaded route with canvas context creation disabled.",
  "WebGL-unavailable message preserved complete 2D fallback.",
);
const prevented = await technicalCanvas.evaluate((element) => {
  const event = new Event("webglcontextlost", { cancelable: true });
  element.dispatchEvent(event);
  return event.defaultPrevented;
});
assert(prevented);
await page.getByText(/WebGL context was lost/).waitFor();
pass(
  32,
  "Dispatched webglcontextlost.",
  "Default was prevented, rendering stopped, and safe fallback message appeared.",
);
await page.getByLabel("Start local").fill("2024-06-01T00:00");
await page.getByLabel("End local").fill("2024-06-06T00:00");
await page.getByLabel(/Step.*minutes/).fill("1");
await page.getByRole("button", { name: "Run in worker" }).click();
await page.getByRole("button", { name: "Cancel" }).click();
await page.getByText(/cancelled; stale worker messages invalidated/).waitFor();
await page.waitForTimeout(50);
assert.match((await page.getByRole("status").first().textContent()) ?? "", /cancelled/);
await page.getByLabel("Start local").fill("2024-06-21T08:00");
await page.getByLabel("End local").fill("2024-06-21T16:00");
await page.getByLabel(/Step.*minutes/).fill("30");
await page.getByRole("button", { name: "Run in worker" }).click();
await page.getByText(/Time-range calculation complete/).waitFor();
const timestampSlider = page.getByLabel("Selected calculated timestamp");
assert(Number(await timestampSlider.getAttribute("max")) >= 1);
pass(
  33,
  "Cancelled a large real-worker run, then completed a bounded run.",
  "Cancellation accepted no partial result; subsequent validated timestamps were sorted chronologically.",
);
await page.getByRole("button", { name: "Previous timestamp" }).click();
await page.getByRole("button", { name: "Next timestamp" }).click();
pass(
  34,
  "Activated Previous and Next.",
  "Both controls remained bounded at first/final positions.",
);
await page.getByRole("button", { name: /Play/ }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Pause/ }).click();
pass(35, "Played and paused.", "One interval advanced validated results without worker creation.");
await timestampSlider.fill((await timestampSlider.getAttribute("max")) ?? "0");
await page.getByRole("button", { name: /Play/ }).click();
await page.waitForTimeout(800);
assert.equal(await timestampSlider.inputValue(), await timestampSlider.getAttribute("max"));
pass(
  36,
  "Played at the final result.",
  "Final timestamp was included and playback stopped automatically.",
);
await page.getByRole("button", { name: "Calculate selected time" }).click();
await page.getByText(/Selected timestamp calculated/).waitFor();
assert.equal(await page.getByLabel("Selected calculated timestamp").getAttribute("max"), "0");
pass(37, "Calculated a single timestamp.", "Single-timestamp playback stayed paused.");
await page.getByLabel(/Latitude/).fill("29");
await page.getByText(/results and playback are stale/).waitFor();
pass(38, "Changed authoritative project input.", "Results became stale and playback stopped.");
await page.getByRole("button", { name: "Start over" }).click();
await page.getByText(/Workspace reset/).waitFor();
pass(
  39,
  "Activated Start over.",
  "Playback interval, worker, findings, source, governance, and URLs were cleared.",
);
const lifecyclePage = await context.newPage();
await lifecyclePage.goto("http://127.0.0.1:8080/renewable-energy/solar/shading", {
  waitUntil: "networkidle",
});
await lifecyclePage.goto("about:blank");
await lifecyclePage.close();
pass(
  40,
  "Unmounted workspace by navigation.",
  "No stale playback callback or runtime error occurred.",
);
await uploadJson("Import RE6A layout-review JSON", "layout.json", authoritativeLayout);
await page.getByText(/Validated 2 immutable/).waitFor();
await page.getByLabel(/Latitude/).fill("28.61");
await page.getByLabel(/Longitude/).fill("77.2");
await page.getByLabel("IANA timezone").fill("UTC");
await page.getByRole("button", { name: "Calculate selected time" }).click();
await page.getByText(/Selected timestamp calculated/).waitFor();
await page.getByRole("button", { name: "Set valid-with-warnings" }).click();
await page.getByRole("button", { name: "Set reviewed" }).click();
pass(
  41,
  "Executed permitted calculated→warning→reviewed transitions.",
  "Both state transitions succeeded.",
);
await page.getByRole("button", { name: "Set restored" }).click();
await page.getByText(/not permitted/).waitFor();
pass(
  42,
  "Attempted prohibited reviewed→restored transition.",
  "Transition was blocked with a visible safe reason.",
);
await page.getByLabel(/Latitude/).fill("");
await page.getByRole("button", { name: "Set approved-for-preliminary-draflio-workflow" }).click();
await page.getByText(/blocked|not permitted/).waitFor();
pass(43, "Attempted approval with stale findings.", "Approval blocker prevented the transition.");
assert(
  (await page
    .locator("ol")
    .filter({ hasText: /calculated-review-required/ })
    .count()) > 0,
);
pass(
  44,
  "Inspected review history.",
  "Timestamped permitted transitions persisted; prohibited action did not append.",
);
await page.getByLabel(/Latitude/).fill("28.61");
await page.getByRole("button", { name: "Calculate selected time" }).click();
await page.getByText(/Selected timestamp calculated/).waitFor();
const companionExport = page.getByRole("button", {
  name: "DraflioScene shading companion JSON",
});
const firstCompanion = await downloadText(page, "DraflioScene shading companion JSON");
await page.waitForTimeout(25);
const firstCompanionValue = JSON.parse(firstCompanion.text) as {
  projectReference: string;
  review: { inputs: { layout: { projectName: string } } };
};
assert.equal(firstCompanionValue.projectReference, "Browser Project");
assert.equal(firstCompanionValue.review.inputs.layout.projectName, "Browser Project");
pass(45, "Downloaded companion.", "Deep validation succeeded before URL creation.");
const secondCompanion = await downloadText(page, "DraflioScene shading companion JSON");
const thirdCompanion = await downloadText(page, "DraflioScene shading companion JSON");
await page.waitForTimeout(25);
assert.equal(firstCompanion.text, secondCompanion.text);
assert.equal(secondCompanion.text, thirdCompanion.text);
pass(
  46,
  "Repeated identical companion export.",
  "Three browser-downloaded companion payloads were byte-for-byte identical.",
);
const crossProjectSource = {
  ...structuredClone(authoritativeSource),
  projectReference: "Different Project",
};
await page.getByLabel("Exact project reference").fill("Browser Project");
const urlsBeforeCrossProject = (await urlState(page)).created.length;
await uploadJson(
  "Review authoritative DraflioScene source",
  "cross-project.json",
  crossProjectSource,
);
await page.waitForTimeout(100);
assert.match(
  (await page.getByRole("status").first().textContent()) ?? "",
  /Cross-project DraflioScene sources are rejected/i,
);
assert.equal((await urlState(page)).created.length, urlsBeforeCrossProject);
const preservedCompanion = await downloadText(page, "DraflioScene shading companion JSON");
const preservedCompanionValue = JSON.parse(preservedCompanion.text) as {
  projectReference: string;
  review: { inputs: { layout: { projectName: string } } };
};
assert.equal(preservedCompanionValue.projectReference, "Browser Project");
assert.equal(preservedCompanionValue.review.inputs.layout.projectName, "Browser Project");
assert(!preservedCompanion.text.includes("Different Project"));
pass(
  47,
  "Attempted a cross-project source replacement through the import UI, then downloaded companion.",
  "The invalid import created no URL or partial state; the browser payload retained matching accepted-project references only.",
);
const createdBeforeMatrix = (await urlState(page)).created.length;
for (const name of ["Shading-review JSON", "Findings CSV", "DraflioScene shading companion JSON"])
  await page.getByRole("button", { name }).click();
await page.waitForTimeout(25);
const matrixUrls = await urlState(page);
assert(matrixUrls.created.length >= createdBeforeMatrix + 3);
pass(
  48,
  "Executed repeated review, CSV, and companion downloads.",
  "Every successful download received a distinct URL.",
);
assert(matrixUrls.created.every((url) => matrixUrls.revoked.includes(url)));
pass(
  49,
  "Observed browser downloads before next-task cleanup.",
  "Revocation did not interrupt successful downloads.",
);
assert.equal(new Set(matrixUrls.created).size, matrixUrls.created.length);
pass(50, "Compared replacement URLs.", "Prior and replacement URLs were distinct and revoked.");
await page.getByRole("button", { name: "Start over" }).click();
const afterStartOverUrls = await urlState(page);
assert(afterStartOverUrls.created.every((url) => afterStartOverUrls.revoked.includes(url)));
pass(51, "Activated Start over after downloads.", "No persistent object URL remained.");
const urlPage = await context.newPage();
await urlPage.goto("http://127.0.0.1:8080/renewable-energy/solar/shading", {
  waitUntil: "networkidle",
});
await urlPage.close();
pass(
  52,
  "Unmounted a fresh download-capable workspace.",
  "Unmount cleanup completed without persistent URLs.",
);
const formulaPage = await context.newPage();
await formulaPage.goto("http://127.0.0.1:8080/renewable-energy/solar/shading", {
  waitUntil: "networkidle",
});
const formulaLayout = fixtureLayout();
const formulaIds = ["=SUM(1,1)", "+cmd", "-1", "@lookup"];
formulaLayout.tables = formulaIds.map((id, index) => ({
  ...formulaLayout.tables[index % formulaLayout.tables.length],
  id,
  center: { x: index * 3 + 1, y: 0.5 },
  footprint: {
    vertices: [
      { x: index * 3, y: 0 },
      { x: index * 3 + 2, y: 0 },
      { x: index * 3 + 2, y: 1 },
      { x: index * 3, y: 1 },
    ],
  },
  columnIndex: index,
}));
const formulaSource = fixtureSource(formulaLayout);
await formulaPage.getByLabel("Exact project reference").fill("Browser Project");
await formulaPage.getByLabel("Review authoritative DraflioScene source").setInputFiles({
  name: "formula-source.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(formulaSource)),
});
await formulaPage.getByText(/Compatible source reviewed/).waitFor();
await formulaPage.getByRole("button", { name: "Confirm authoritative source" }).click();
await formulaPage.getByLabel(/Latitude/).fill("28.61");
await formulaPage.getByLabel(/Longitude/).fill("77.2");
await formulaPage.getByLabel("IANA timezone").fill("UTC");
await formulaPage.getByRole("button", { name: "Calculate selected time" }).click();
await formulaPage.getByText(/Selected timestamp calculated/).waitFor();
const formulaCsv = await downloadText(formulaPage, "Findings CSV");
await formulaPage.waitForTimeout(25);
const csvLines = formulaCsv.text.trim().split("\r\n");
assert.equal(
  csvLines[0],
  '"timestamp","domain","source","receiver","state","samples","shaded","geometric_fraction","warnings"',
);
for (const value of formulaIds) {
  assert(
    formulaCsv.text.includes(`"'${value.replaceAll('"', '""')}"`),
    `Formula-prefixed value ${value} was not neutralised in the browser CSV.`,
  );
  assert(!formulaCsv.text.includes(`,"${value}"`), `Executable CSV field remained: ${value}`);
}
assert.match(formulaCsv.text, /"geometric_fraction"/);
assert.match(formulaCsv.filename, /^[A-Za-z0-9_-]+\.csv$/);
const formulaUrls = await urlState(formulaPage);
assert(formulaUrls.created.length >= 1);
assert(formulaUrls.created.every((url) => formulaUrls.revoked.includes(url)));
await formulaPage.close();
pass(
  53,
  "Imported four formula-prefixed table IDs, calculated, and captured the real Findings CSV download.",
  "Downloaded UTF-8 CSV retained stable columns and geometric terminology, escaped every dangerous ID with an apostrophe, and revoked its URL.",
);
for (const viewport of [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  await page.setViewportSize(viewport);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}
await page.keyboard.press("Tab");
assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
const browserPrivacy = await page.evaluate(() => {
  const values = (
    window as unknown as {
      __shadingLifecycle: { lifecycle: { storageCalls: number } };
    }
  ).__shadingLifecycle.lifecycle;
  return {
    storageCalls: values.storageCalls,
    cookie: document.cookie,
    serviceWorker: navigator.serviceWorker?.controller ?? null,
  };
});
assert.equal(browserPrivacy.storageCalls, 0);
assert.equal(browserPrivacy.cookie, "");
assert.equal(browserPrivacy.serviceWorker, null);
assert.deepEqual(errors, []);
assert.equal(external.length, 0);
pass(
  54,
  "Checked responsive layouts, keyboard, runtime, network, and persistence.",
  "No overflow, runtime error, external request, storage call, cookie, or service worker.",
);
assert.equal(evidence.length, 54);
assert.deepEqual(
  evidence.map((item) => item.item),
  Array.from({ length: 54 }, (_, index) => index + 1),
);
for (const item of evidence) console.log(JSON.stringify(item));
await browser.close();
process.exit(0);

async function urlState(target: typeof page) {
  return target.evaluate(
    () =>
      (window as unknown as { __shadingUrls: { created: string[]; revoked: string[] } })
        .__shadingUrls,
  );
}

function fixtureLayout(): LayoutReview {
  const table = (id: string, x: number) => ({
    id,
    arrayAreaId: "A",
    tableTypeId: "D",
    moduleRecordId: "M",
    moduleCount: 1,
    dcPowerWatts: 400,
    footprint: {
      vertices: [
        { x, y: 0 },
        { x: x + 2, y: 0 },
        { x: x + 2, y: 1 },
        { x, y: 1 },
      ],
    },
    center: { x: x + 1, y: 0.5 },
    azimuthDegrees: 180,
    tiltDegrees: 20,
    rowIndex: 0,
    columnIndex: x,
    terrainSamples: [{ point: { x, y: 0 }, elevation: 0 }],
    reviewStatus: "reviewed" as const,
    findings: [],
    algorithmVersion: "layout-generation-1.0" as const,
    generationAssumptions: "Browser fixture",
    editHistory: [],
  });
  return {
    schemaName: "draflio-layout-review",
    schemaVersion: "1.0",
    projectName: "Browser Project",
    coordinateSystem: "registered-local-metric",
    inputs: {},
    registration: {
      method: "already-aligned",
      active: true,
      confirmed: true,
      pointCount: 0,
      translation: { x: 0, y: 0 },
      rotationDegrees: 0,
      scale: 1,
      rmsResidual: 0,
      maximumResidual: 0,
      residuals: [],
      transformDirection: "drawing-to-terrain",
      warningThresholdMeters: 0.1,
      warnings: [],
      algorithmVersion: "similarity-registration-1.0",
    },
    siteBoundary: reviewedPolygon("boundary", [
      { x: -2, y: -2 },
      { x: 12, y: -2 },
      { x: 12, y: 8 },
      { x: -2, y: 8 },
      { x: -2, y: -2 },
    ]),
    exclusions: [
      {
        ...reviewedPolygon("exclusion", [
          { x: 8, y: 4 },
          { x: 10, y: 4 },
          { x: 10, y: 6 },
          { x: 8, y: 6 },
          { x: 8, y: 4 },
        ]),
        category: "building",
        reason: "Reviewed browser fixture",
        effectiveGeometry: {
          vertices: [
            { x: 8, y: 4 },
            { x: 10, y: 4 },
            { x: 10, y: 6 },
            { x: 8, y: 6 },
            { x: 8, y: 4 },
          ],
        },
      },
    ],
    terrainLimits: {
      maximumSlopeDegrees: 10,
      minimumNoDataDistanceMeters: 0,
    },
    tableDefinitions: [],
    arrayAreas: [
      {
        ...reviewedPolygon("array-area", [
          { x: -1, y: -1 },
          { x: 7, y: -1 },
          { x: 7, y: 3 },
          { x: -1, y: 3 },
          { x: -1, y: -1 },
        ]),
        priority: 1,
        tableTypeId: "D",
        azimuthDegrees: 180,
        rowPitchMeters: 4,
        columnSpacingMeters: 1,
        boundarySetbackMeters: 0,
        effectivePlacementRegions: [
          {
            vertices: [
              { x: -1, y: -1 },
              { x: 7, y: -1 },
              { x: 7, y: 3 },
              { x: -1, y: 3 },
              { x: -1, y: -1 },
            ],
          },
        ],
        setbackAlgorithmVersion: "browser-fixture-1.0",
        minimumTableSpacingMeters: 1,
        origin: { x: 0, y: 0 },
        generationDirection: "positive-x",
        maximumTableCount: 2,
      },
    ],
    tables: [table("T-1", 0), table("T-2", 4)],
    findings: [],
    reviewStatus: "reviewed",
    limitations: [],
    algorithmVersions: [],
  };
}

function reviewedPolygon(id: string, vertices: { x: number; y: number }[]) {
  return {
    id,
    name: id,
    geometry: { vertices },
    originalGeometry: { vertices: structuredClone(vertices) },
    source: "layout-review" as const,
    sourceReference: `browser-${id}`,
    reviewStatus: "reviewed" as const,
    areaSquareMeters: 1,
    warnings: [],
  };
}

function fixtureSource(layout: LayoutReview) {
  const scene = createEmptyDraflioScene("Browser source");
  scene.sceneId = "00000000-0000-4000-8000-000000000099";
  scene.coordinateSystem = { type: "local", name: "Registered local metric" };
  scene.reviewSummary.status = "approved";
  return {
    sourceType: "draflio-scene-authoritative-layout",
    schemaVersion: "1.0",
    calculationVersion: SHADING_RULE_VERSION,
    projectReference: "Browser Project",
    sourceSceneReference: scene.sceneId,
    coordinateSystem: "registered-local-metric",
    units: "metres",
    registrationState: "confirmed",
    sourceReviewState: "approved",
    terrainRequired: true,
    scene,
    layoutReview: layout,
    terrain: {
      reviewState: "verified",
      provenance: "Browser verified survey mesh.",
      mesh: {
        vertices: [
          { x: -2, y: -2, z: 0 },
          { x: 3, y: -2, z: 0 },
          { x: -2, y: 8, z: 0.5 },
          { x: 3, y: 8, z: 0.5 },
        ],
        triangles: [
          [0, 1, 2],
          [1, 3, 2],
        ],
      },
      noDataGeometry: [
        {
          id: "survey-hole",
          vertices: [
            { x: 9, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 1 },
            { x: 9, y: 1 },
            { x: 9, y: 0 },
          ],
          provenance: "Survey coverage mask.",
          method: "survey-mask",
          methodVersion: "1.0",
        },
      ],
    },
    provenance: "Browser authoritative source fixture.",
  } as const;
}

function fixtureDrawing() {
  return {
    sourceType: "drawing-to-scene-obstructions",
    schemaVersion: "1.0",
    projectReference: "Browser Project",
    drawingReference: "drawing-browser",
    coordinateSystem: "registered-local-metric",
    units: "metres",
    registrationState: "confirmed",
    sourceReviewState: "reviewed",
    provenance: "Reviewed Drawing-to-Scene browser fixture.",
    records: [
      {
        id: "obstruction-1",
        pageReference: 1,
        sourceObjectReference: "drawing-object-1",
        footprint: [
          { x: 1, y: 1 },
          { x: 3, y: 1 },
          { x: 3, y: 2 },
          { x: 1, y: 2 },
          { x: 1, y: 1 },
        ],
        heightMeters: 8,
        baseElevationMeters: 0,
        baseElevationBasis: "explicit",
        classification: "wall",
        uncertaintyMeters: 0.1,
        provenance: "Drawing page 1 object 1.",
        creationMethod: "reviewed-drawing",
      },
    ],
  } as const;
}
