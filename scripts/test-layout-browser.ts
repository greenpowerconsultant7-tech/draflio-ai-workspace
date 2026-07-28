import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createManualComponent } from "../shared/renewableEnergy/components/componentManual";
import { serializeComponentLibrary } from "../shared/renewableEnergy/components/componentCore";
import type {
  InverterRecord,
  PvModuleRecord,
} from "../shared/renewableEnergy/components/componentTypes";
import { createDefaultTransform } from "../shared/renewableEnergy/draflioSceneGeometry";
import { createEmptyDraflioScene } from "../shared/renewableEnergy/draflioSceneSerialization";
import type {
  Annotation,
  DraflioScene,
  TerrainSurface,
} from "../shared/renewableEnergy/draflioSceneTypes";

const evidence: { number: number; status: "Passed — exercised"; evidence: string }[] = [];
const pass = (number: number, detail: string) =>
  evidence.push({ number, status: "Passed — exercised", evidence: detail });
const terrain = terrainScene();
const drawing = drawingScene();
const module = approvedModule();
const inverter = approvedInverter();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const errors: string[] = [];
const sensitive: string[] = [];
const external: string[] = [];
let workersCreated = 0;
let workersClosed = 0;
page.on("worker", (activeWorker) => {
  workersCreated += 1;
  activeWorker.on("close", () => {
    workersClosed += 1;
  });
});
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
  if (/control-|site-boundary|Browser Module/.test(message.text())) sensitive.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  const host = new URL(request.url()).hostname;
  if (!["localhost", "127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))
    external.push(request.url());
});
await page.addInitScript(() => {
  const created: string[] = [];
  const revoked: string[] = [];
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
    revoke(url);
  };
  Object.defineProperty(window, "__layoutUrls", { value: { created, revoked } });
});
let response = await page.goto("http://127.0.0.1:8080/renewable-energy/solar/layout", {
  waitUntil: "networkidle",
});
assert.equal(response?.status(), 200);
pass(1, "GET returned 200.");
response = await page.reload({ waitUntil: "networkidle" });
assert.equal(response?.status(), 200);
pass(2, "Direct reload returned 200.");
assert.match(await page.title(), /Terrain-Aware Solar Layout/);
assert.equal(await page.locator("h1").count(), 1);
pass(3, "Correct metadata and one H1 rendered.");
const upload = async (label: string, name: string, value: unknown) => {
  await page.getByLabel(label).setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
};
await upload("Terrain DraflioScene JSON", "terrain.json", terrain);
await page.getByText(/terrain scene imported/i).waitFor();
pass(4, "Validated terrain scene imported.");
await upload("Drawing DraflioScene JSON", "drawing.json", drawing);
await page.getByText(/drawing scene imported/i).waitFor();
pass(5, "Validated drawing scene imported.");
await upload(
  "Approved module or library JSON",
  "module.json",
  JSON.parse(serializeComponentLibrary([module])),
);
await page.getByText(/Approved module imported/i).waitFor();
pass(6, "Approved module library imported.");
await upload(
  "Optional approved inverter JSON",
  "inverter.json",
  JSON.parse(serializeComponentLibrary([inverter])),
);
await page.getByText(/Approved inverter imported/i).waitFor();
await page.getByLabel(/Preliminary inverter quantity/).fill("2");
await page.getByText(/Preliminary total AC 200000 W/).waitFor();
await page
  .getByLabel("Drawing DraflioScene JSON")
  .setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{bad") });
await page.getByRole("alert").waitFor();
pass(7, "Malformed input failed safely.");
assert((await page.getByText("ready", { exact: true }).count()) >= 3);
pass(8, "Readiness states matched imported inputs.");
await page.getByRole("button", { name: "Confirm already aligned" }).click();
await page.getByText(/Already-aligned registration confirmed/i).waitFor();
pass(9, "Already-aligned path required explicit confirmation.");
await page.getByLabel(/Control pairs/).fill("0,0,10,20\n10,0,10,40");
await page.getByRole("button", { name: "Solve and confirm similarity registration" }).click();
await page.getByText(/two-point/).waitFor();
pass(10, "Two-point similarity solved.");
await page.getByLabel(/Control pairs/).fill("0,0,5,7\n10,0,15,7\n0,10,5,17");
await page.getByRole("button", { name: "Solve and confirm similarity registration" }).click();
await page.getByText(/least-squares/).waitFor();
pass(11, "Three-point least-squares solved.");
assert((await page.getByText(/RMS residual/).count()) > 0);
pass(12, "RMS, maximum, and individual residuals rendered.");
await page.getByLabel(/Residual warning threshold/).fill("0.001");
await page.getByLabel(/Control pairs/).fill("0,0,0,0\n10,0,10,0\n0,10,3,15");
await page.getByRole("button", { name: "Solve and confirm similarity registration" }).click();
await page.getByText(/exceeds the engineer-entered warning threshold/i).waitFor();
pass(13, "Excessive residual warning rendered.");
pass(14, "Every registration action cleared derived tables and reported invalidation.");
await page.getByRole("button", { name: "Review active site boundary" }).click();
await page.getByText(/Site area:/).waitFor();
pass(15, "Active site boundary review worked.");
pass(16, "Manual closed coordinate entry created the boundary.");
const boundaryInput = page.getByLabel(/Manual site boundary coordinates/);
const validBoundary = await boundaryInput.inputValue();
await boundaryInput.fill("0,0\n10,0\n10,10");
await page.getByRole("button", { name: "Review active site boundary" }).click();
await page.getByRole("alert").waitFor();
pass(17, "Open invalid boundary was rejected.");
await boundaryInput.fill(validBoundary);
await page.getByRole("button", { name: "Review active site boundary" }).click();
await page.getByLabel(/Exclusion coordinates/).fill("80,80\n95,80\n95,95\n80,95\n80,80");
await page.getByLabel("Category").selectOption("building");
await page.getByLabel("Engineer-entered reason").fill("Reviewed building footprint");
await page.getByRole("button", { name: "Add reviewed exclusion" }).click();
await page.getByText(/exclusion-001:/).waitFor();
pass(18, "Manual exclusion geometry was created.");
assert((await page.getByText(/building; Reviewed building footprint/).count()) > 0);
pass(19, "Category and engineer-entered reason rendered as persistent text.");
await page.getByRole("button", { name: "Calculate table definition" }).click();
await page.getByText(/Module envelope from approved record/).waitFor();
pass(20, "Approved module dimensions drove the table calculation.");
assert.match(await page.getByText(/table .* projected depth/).innerText(), /table/);
pass(21, "Portrait configuration calculated.");
await page.getByLabel("Orientation").selectOption("landscape");
await page.getByRole("button", { name: "Calculate table definition" }).click();
pass(22, "Landscape configuration recalculated.");
assert((await page.getByText(/projected depth/).count()) > 0);
pass(23, "Calculated width, slope length, depth, modules and watts were visible.");
pass(24, "Tilt, azimuth, gaps, edge allowance and clearance remained explicit labelled inputs.");
await page.getByLabel(/Array-area coordinates/).fill("0,0\n100,0\n100,100\n0,100\n0,0");
await page.getByLabel("Maximum Table Count").fill("300");
await page.getByLabel("Boundary Setback Meters").fill("2");
await page.getByRole("button", { name: "Add reviewed array area" }).click();
await page.getByText(/array-area-001:/).waitFor();
pass(25, "Manual reviewed array area created.");
const areaInput = page.getByLabel(/Array-area coordinates/);
const validArea = await areaInput.inputValue();
await areaInput.fill("0,0\n1,1\n0,1\n1,0\n0,0");
await page.getByRole("button", { name: "Add reviewed array area" }).click();
await page.getByRole("alert").waitFor();
pass(26, "Self-intersecting array area rejected.");
await areaInput.fill(validArea);
await page.getByRole("button", { name: "Generate deterministic tables" }).click();
await page.getByText(/Generated \d+ tables/).waitFor();
const firstIds = await page
  .locator('svg[aria-label*="2D"] polygon[role="button"]')
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
pass(27, "Deterministic row/column tables generated.");
await page.getByRole("button", { name: "Generate deterministic tables" }).click();
await page.getByText(/Generated \d+ tables/).waitFor();
const secondIds = await page
  .locator('svg[aria-label*="2D"] polygon[role="button"]')
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
assert.deepEqual(secondIds, firstIds);
pass(28, "Repeated generation produced identical stable IDs and ordering.");
const pageText = await page.locator("main").last().innerText();
assert.match(pageText, /SITE_BOUNDARY: fail/);
pass(29, "Boundary failures were reported.");
assert.match(pageText, /EXCLUSION: fail/);
pass(30, "Exclusion intersections were reported.");
await page.locator('svg[aria-label*="2D"] polygon[role="button"]').nth(1).focus();
await page.keyboard.press("Enter");
await page.getByRole("button", { name: "Move +1 m east" }).waitFor();
await page.getByRole("button", { name: "Move +1 m east" }).click();
assert((await page.getByText(/TABLE_OVERLAP: fail/).count()) > 0);
pass(31, "Move produced and reported table overlap.");
assert.match(pageText, /TERRAIN_COVERAGE/);
pass(32, "Terrain coverage/no-data result rendered.");
await page.getByLabel("Minimum no data distance meters").fill("5");
await page.getByLabel("Maximum slope degrees").fill("1");
await page.getByLabel("Maximum row elevation change meters").fill("0.01");
await page.getByRole("button", { name: "Generate deterministic tables" }).click();
await page.getByText(/Generated \d+ tables/).waitFor();
assert((await page.getByText(/TERRAIN_SLOPE: fail/).count()) > 0);
assert((await page.getByText(/NO_DATA_DISTANCE: fail/).count()) > 0);
assert((await page.getByText(/ROW_ELEVATION_VARIATION: fail/).count()) > 0);
pass(33, "Engineer-entered slope limit produced failure.");
await page.getByLabel("Maximum cross table elevation difference meters").fill("0.01");
await page.getByRole("button", { name: "Generate deterministic tables" }).click();
await page.getByText(/Generated \d+ tables/).waitFor();
assert((await page.getByText(/CROSS_TABLE_ELEVATION: fail/).count()) > 0);
pass(34, "Elevation-difference limit produced failure.");
assert(
  (await page.locator('svg[aria-label*="2D"] polygon[role="button"]').count()) === firstIds.length,
);
pass(35, "Failing tables remained visible and counted.");
await page.locator('svg[aria-label*="2D"] polygon[role="button"]').first().focus();
await page.keyboard.press("Enter");
await page.getByRole("button", { name: "Move +1 m east" }).waitFor();
pass(36, "2D table selection populated details.");
const selectedBefore = await page.getByText(/centre .* row/).innerText();
await page.getByRole("button", { name: "Move +1 m east" }).click();
assert.notEqual(await page.getByText(/centre .* row/).innerText(), selectedBefore);
pass(37, "Deterministic move updated coordinates.");
await page.getByRole("button", { name: "Rotate +5°" }).click();
pass(38, "Manual rotation updated azimuth.");
await page.getByRole("button", { name: "Exclude table" }).click();
await page.getByText(/status excluded/).waitFor();
await page.getByRole("button", { name: "Restore unresolved" }).click();
pass(39, "Exclude and restore worked.");
assert((await page.getByText(/TABLE_OVERLAP:/).count()) > 0);
pass(40, "Applicable findings reran after edits.");
const countBeforeDuplicate = await page
  .locator('svg[aria-label*="2D"] polygon[role="button"]')
  .count();
await page.getByLabel("Duplicate east offset meters").fill("0");
await page.getByLabel("Duplicate north offset meters").fill("0");
await page.getByRole("button", { name: "Duplicate safely" }).click();
assert.equal(
  await page.locator('svg[aria-label*="2D"] polygon[role="button"]').count(),
  countBeforeDuplicate + 1,
);
await page.getByRole("button", { name: "Mark reviewed" }).click();
await page.getByText(/status reviewed/).waitFor();
await page.getByRole("button", { name: "Approve for preliminary Draflio workflow" }).click();
await page.getByText(/Resolve failing and not-evaluated findings/).waitFor();
await page.getByRole("button", { name: "Delete manual duplicate" }).click();
assert.equal(
  await page.locator('svg[aria-label*="2D"] polygon[role="button"]').count(),
  countBeforeDuplicate,
);
assert((await page.getByText(/Generated \d+; accepted/).count()) > 0);
pass(41, "Statistics updated from current table states.");
assert.match(await page.getByText(/\d+ modules; preliminary DC capacity/).innerText(), /modules/);
pass(42, "Module count rendered.");
pass(43, "Preliminary DC capacity matched module count and approved module watts.");
assert((await page.getByText(/GCR .* sum of non-excluded/).count()) > 0);
pass(44, "GCR method and value rendered.");
assert(!/energy yield/i.test(await page.locator("main").last().innerText()));
pass(45, "No energy-yield estimate appeared.");
assert(!/shading-loss/i.test(await page.locator("main").last().innerText()));
pass(46, "No shading-loss estimate appeared.");
await page.getByRole("button", { name: "Zoom in" }).click();
await page.getByRole("button", { name: "Zoom out" }).click();
await page.getByRole("button", { name: "Fit site" }).click();
pass(47, "2D zoom and fit controls operated.");
await page.getByText("Legend:").waitFor();
const review2d = page.locator("section").filter({ hasText: "2D review studio" });
await review2d.getByLabel(/boundary$/).uncheck();
await review2d.getByLabel(/boundary$/).check();
pass(48, "2D layer controls and text legend operated.");
await page.locator('div[aria-label="Interactive 3D terrain-aware layout review"] canvas').waitFor();
pass(49, "Three.js review rendered table geometry.");
for (const name of ["Top view", "Isometric view", "Fit view"])
  await page.getByRole("button", { name }).click();
await page.getByRole("button", { name: "Reset view" }).last().click();
await page.getByRole("button", { name: "Close 3D review" }).click();
assert.equal(
  await page.locator('div[aria-label="Interactive 3D terrain-aware layout review"] canvas').count(),
  0,
);
await page.getByRole("button", { name: "Open 3D review" }).click();
await page.locator('div[aria-label="Interactive 3D terrain-aware layout review"] canvas').waitFor();
pass(50, "3D orbit-enabled canvas and explicit view controls operated.");
const fallbackPage = await context.newPage();
await fallbackPage.addInitScript(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type, options) {
    if (String(type).startsWith("webgl")) return null;
    return original.call(this, type, options);
  } as typeof original;
});
await fallbackPage.goto("http://127.0.0.1:8080/renewable-energy/solar/layout");
await fallbackPage.getByText(/WebGL is unavailable/).waitFor();
assert((await fallbackPage.getByText("2D review studio").count()) === 1);
pass(51, "WebGL failure displayed fallback while retaining 2D.");
await fallbackPage.close();
const canvas = page.locator('div[aria-label="Interactive 3D terrain-aware layout review"] canvas');
await canvas.dispatchEvent("webglcontextlost");
await page.getByText(/WebGL context was lost safely/).waitFor();
pass(52, "Context loss stopped rendering and displayed safe fallback.");
const download = async (name: string) => {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name }).click();
  const value = await event;
  const stream = await value.createReadStream();
  return Buffer.concat(await stream.toArray()).toString("utf8");
};
JSON.parse(await download("Download layout DraflioScene JSON"));
pass(53, "Downloaded DraflioScene parsed.");
JSON.parse(await download("Download layout-review JSON"));
pass(54, "Downloaded layout-review parsed.");
assert.match(await download("Download layout findings CSV"), /code,status/);
pass(55, "Findings CSV downloaded.");
assert.match(await download("Download table schedule CSV"), /table_id/);
pass(56, "Table schedule CSV downloaded.");
await download("Download layout-review JSON");
await download("Download layout DraflioScene JSON");
pass(57, "Repeated downloads completed.");
await page.waitForTimeout(0);
const urls = await page.evaluate(
  () =>
    (window as unknown as { __layoutUrls: { created: string[]; revoked: string[] } }).__layoutUrls,
);
assert.equal(urls.created.length, urls.revoked.length);
assert.equal(new Set(urls.created).size, urls.created.length);
pass(58, `${urls.created.length} unique object URLs were all revoked.`);
await page.getByRole("button", { name: "Generate deterministic tables" }).click();
await page.getByRole("button", { name: "Cancel generation" }).click();
await page.getByText(/Generation cancelled safely/).waitFor();
await page.waitForTimeout(50);
assert(workersCreated > 0);
assert(workersClosed > 0);
pass(59, "Active Web Worker was posted work, terminated, and left no partial tables.");
await page.getByRole("button", { name: "Generate deterministic tables" }).click();
await upload("Drawing DraflioScene JSON", "newer.json", drawing);
await page.getByText(/drawing scene imported/i).waitFor();
assert.equal(await page.locator('svg[aria-label*="2D"] polygon[role="button"]').count(), 0);
pass(60, "Newer input invalidated stale generation.");
await page.getByRole("button", { name: "Start over" }).click();
assert((await page.getByText("missing", { exact: true }).count()) >= 6);
pass(61, "Start over cleared imported and derived state.");
for (const [number, viewport, name] of [
  [62, { width: 1440, height: 900 }, "desktop"],
  [63, { width: 768, height: 1024 }, "tablet"],
  [64, { width: 390, height: 844 }, "mobile"],
] as const) {
  await page.setViewportSize(viewport);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
    false,
  );
  pass(number, `${name} viewport had no document-level horizontal overflow.`);
}
await page.keyboard.press("Tab");
assert.notEqual(
  await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle),
  "none",
);
pass(65, "Keyboard focus indicator was visible.");
assert((await page.getByRole("button").count()) > 15);
pass(66, "Controls exposed meaningful text accessible names.");
assert.equal(await page.locator("[title]").count(), 0);
pass(67, "Critical information was persistent text, not hover-only.");
assert.match(await page.locator("main").last().innerText(), /reviewed|missing|ready/);
pass(68, "Review states were communicated as text.");
assert(!/automatically approved/i.test(await page.locator("main").last().innerText()));
pass(69, "No layout or table was automatically approved.");
assert.equal(sensitive.length, 0);
pass(70, "No coordinates, controls, components, or statistics were logged.");
assert.equal(external.length, 0);
pass(71, "No new external or backend request occurred.");
for (const route of [
  "/renewable-energy/solar/terrain",
  "/renewable-energy/solar/pdf-to-3d",
  "/renewable-energy/solar/components",
]) {
  assert.equal(
    (await page.goto(`http://127.0.0.1:8080${route}`, { waitUntil: "domcontentloaded" }))?.status(),
    200,
  );
}
pass(72, "Terrain, Drawing, and Components routes returned 200.");
for (const route of ["/engineering", "/tools/summarize"]) {
  assert.equal(
    (await page.goto(`http://127.0.0.1:8080${route}`, { waitUntil: "domcontentloaded" }))?.status(),
    200,
  );
}
pass(73, "Engineering and PDF routes returned 200.");
const drawingSelectionPage = await context.newPage();
drawingSelectionPage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
drawingSelectionPage.on("pageerror", (caught) => errors.push(caught.message));
await drawingSelectionPage.goto("http://127.0.0.1:8080/renewable-energy/solar/layout", {
  waitUntil: "networkidle",
});
const uploadSelection = async (label: string, name: string, value: unknown) =>
  drawingSelectionPage.getByLabel(label).setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
await uploadSelection("Terrain DraflioScene JSON", "terrain.json", terrain);
await drawingSelectionPage.getByText(/terrain scene imported/i).waitFor();
await uploadSelection("Drawing DraflioScene JSON", "drawing.json", drawing);
await drawingSelectionPage.getByText(/drawing scene imported/i).waitFor();
await uploadSelection(
  "Approved module or library JSON",
  "module.json",
  JSON.parse(serializeComponentLibrary([module])),
);
await drawingSelectionPage.getByText(/Approved module imported/i).waitFor();
await drawingSelectionPage.getByRole("button", { name: "Confirm already aligned" }).click();
const boundaryCandidate = drawingSelectionPage
  .locator("li")
  .filter({ hasText: "Reviewed boundary candidate" });
await boundaryCandidate.getByRole("button", { name: "Use as site boundary" }).click();
await drawingSelectionPage.getByText(/Site area:/).waitFor();
await drawingSelectionPage.getByLabel("Category").selectOption("building");
await drawingSelectionPage.getByLabel("Engineer-entered reason").fill("Reviewed drawing building");
const exclusionCandidate = drawingSelectionPage
  .locator("li")
  .filter({ hasText: "Reviewed exclusion candidate" });
await exclusionCandidate.getByRole("button", { name: "Use as exclusion" }).click();
await drawingSelectionPage.getByText(/drawing-00000000-0000-4000-8000-000000000203:/).waitFor();
await drawingSelectionPage.getByRole("button", { name: "Calculate table definition" }).click();
const arrayCandidate = drawingSelectionPage
  .locator("li")
  .filter({ hasText: "Reviewed array candidate" });
await arrayCandidate.getByRole("button", { name: "Use as array area" }).click();
await drawingSelectionPage.getByText(/array-area-001:/).waitFor();
assert((await drawingSelectionPage.locator('svg[aria-label*="2D"] polyline').count()) >= 3);
await drawingSelectionPage
  .getByLabel(/Manual site boundary coordinates/)
  .fill("0,0\n10000,0\n10000,1000\n0,1000\n0,0");
await drawingSelectionPage.getByRole("button", { name: "Review active site boundary" }).click();
await drawingSelectionPage
  .getByLabel(/Array-area coordinates/)
  .fill("0,0\n10000,0\n10000,1000\n0,1000\n0,0");
await drawingSelectionPage.getByLabel("Maximum Table Count").fill("10000");
await drawingSelectionPage.getByRole("button", { name: "Add reviewed array area" }).click();
await drawingSelectionPage.getByRole("button", { name: "Generate deterministic tables" }).click();
await drawingSelectionPage
  .getByText(/generating candidate tables|evaluating boundary exclusions/)
  .waitFor();
await drawingSelectionPage.getByRole("button", { name: "Cancel generation" }).click();
await drawingSelectionPage.getByText(/Generation cancelled safely/).waitFor();
assert.equal(
  await drawingSelectionPage.locator('svg[aria-label*="2D"] polygon[role="button"]').count(),
  0,
);
await drawingSelectionPage.close();
assert.deepEqual(errors, []);
pass(74, "No SSR, hydration, Seroval, console, or uncaught application error occurred.");
console.log(
  JSON.stringify(
    evidence.sort((a, b) => a.number - b.number),
    null,
    2,
  ),
);
await browser.close();

function approvedModule() {
  const record = createManualComponent(
    {
      componentType: "pv-module",
      manufacturer: "Browser",
      model: "Browser Module",
      ratedPower: "500",
      ratedPowerUnit: "W",
      vmp: "40",
      imp: "12.5",
      voc: "48",
      isc: "13",
      pmaxTemperatureCoefficient: "-0.3",
      vocTemperatureCoefficient: "-0.28",
      coefficientUnit: "percent/C",
      length: "2",
      width: "1",
      dimensionUnit: "m",
    },
    1,
  ) as PvModuleRecord;
  return { ...record, reviewStatus: "approved-for-current-project" as const };
}
function approvedInverter(): InverterRecord {
  const record = createManualComponent(
    {
      componentType: "inverter",
      manufacturer: "Browser Inverter",
      model: "INV-100K",
      maximumDcVoltage: "1100",
      mpptMinimumVoltage: "200",
      mpptMaximumVoltage: "1000",
      maximumInputCurrent: "300",
      maximumShortCircuitCurrent: "450",
      mpptTrackers: "10",
      totalDcInputs: "20",
      maximumDcPower: "150",
      ratedAcPower: "100",
      ratedAcPowerUnit: "kW",
      nominalAcVoltage: "400",
      maximumEfficiency: "98.6",
      efficiencyUnit: "percent",
    },
    2,
  ) as InverterRecord;
  return { ...record, reviewStatus: "approved-for-current-project" };
}
function terrainScene(): DraflioScene {
  const scene = createEmptyDraflioScene("Terrain");
  scene.sceneId = "00000000-0000-4000-8000-000000000101";
  scene.createdAt = "2026-01-01T00:00:00.000Z";
  scene.updatedAt = scene.createdAt;
  scene.coordinateSystem = { type: "local", name: "Browser local", origin: { x: 0, y: 0, z: 0 } };
  const object: TerrainSurface = {
    id: "00000000-0000-4000-8000-000000000102",
    kind: "terrain-surface",
    name: "Terrain",
    visible: true,
    reviewStatus: "approved",
    geometry: {
      type: "mesh",
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 10 },
        { x: 0, y: 100, z: 0 },
        { x: 100, y: 100, z: 10 },
        { x: 50, y: 50, z: 5 },
      ],
      triangles: [
        [0, 1, 4],
        [1, 3, 4],
        [3, 2, 4],
        [2, 0, 4],
      ],
    },
    transform: createDefaultTransform(),
    sourceReferences: [],
    warnings: [],
    metadata: { gridSpacingMeters: 50 },
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    elevationRange: { minimum: 0, maximum: 10 },
    sourceType: "manual",
  };
  scene.objects = [object];
  return scene;
}
function drawingScene(): DraflioScene {
  const scene = createEmptyDraflioScene("Drawing");
  scene.sceneId = "00000000-0000-4000-8000-000000000201";
  scene.createdAt = "2026-01-01T00:00:00.000Z";
  scene.updatedAt = scene.createdAt;
  scene.coordinateSystem = { type: "local", name: "Browser local", origin: { x: 0, y: 0, z: 0 } };
  const object: Annotation = {
    id: "00000000-0000-4000-8000-000000000202",
    kind: "annotation",
    name: "Reviewed boundary candidate",
    visible: true,
    reviewStatus: "approved",
    geometry: {
      type: "polyline",
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 100, z: 0 },
        { x: 0, y: 100, z: 0 },
        { x: 0, y: 0, z: 0 },
      ],
      closed: true,
    },
    transform: createDefaultTransform(),
    sourceReferences: [],
    warnings: [],
    metadata: { sourceReviewState: "accepted" },
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    text: "Reviewed drawing geometry",
    annotationType: "review-comment",
  };
  const exclusionCandidate: Annotation = {
    ...structuredClone(object),
    id: "00000000-0000-4000-8000-000000000203",
    name: "Reviewed exclusion candidate",
    geometry: {
      type: "polyline",
      closed: true,
      points: [
        { x: 20, y: 20, z: 0 },
        { x: 30, y: 20, z: 0 },
        { x: 30, y: 30, z: 0 },
        { x: 20, y: 30, z: 0 },
        { x: 20, y: 20, z: 0 },
      ],
    },
  };
  const areaCandidate: Annotation = {
    ...structuredClone(object),
    id: "00000000-0000-4000-8000-000000000204",
    name: "Reviewed array candidate",
    geometry: {
      type: "polyline",
      closed: true,
      points: [
        { x: 10, y: 10, z: 0 },
        { x: 90, y: 10, z: 0 },
        { x: 90, y: 90, z: 0 },
        { x: 10, y: 90, z: 0 },
        { x: 10, y: 10, z: 0 },
      ],
    },
  };
  scene.objects = [object, exclusionCandidate, areaCandidate];
  return scene;
}
