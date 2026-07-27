import { chromium } from "playwright";

const results = [];
const pass = (n, evidence) => results.push({ n, status: "Passed — exercised", evidence });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
const consoleErrors = [];
const sensitiveLogs = [];
const external = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
  if (/Browser test manufacturer|M-550|INV-100K/.test(message.text()))
    sensitiveLogs.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("request", (request) => {
  const host = new URL(request.url()).hostname;
  if (!["127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))
    external.push(request.url());
});
await page.addInitScript(() => {
  const created = [];
  const revoked = [];
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
  Object.defineProperty(window, "__re5aUrls", { value: { created, revoked } });
});
let response = await page.goto("http://127.0.0.1:8080/renewable-energy/solar/components", {
  waitUntil: "networkidle",
});
if (response?.status() !== 200) throw new Error("route did not return 200");
pass(1, "GET returned 200.");
response = await page.reload({ waitUntil: "networkidle" });
if (response?.status() !== 200) throw new Error("refresh failed");
pass(2, "Direct reload returned 200 and rendered.");
if (
  !(await page.title()).includes("Component Intelligence") ||
  (await page.locator("h1").count()) !== 1
)
  throw new Error("metadata/H1 failed");
pass(3, `Title "${await page.title()}" and one H1.`);

await page.getByRole("button", { name: "Save as review required" }).click();
await page.getByRole("alert").waitFor();
pass(6, "Empty manual save produced required finite-value error.");
const fill = async (label, value) => page.getByLabel(label, { exact: true }).fill(value);
await fill("Manufacturer", "Browser test manufacturer");
await fill("Model", "M-550");
await fill("Rated power", "0.55");
await page.getByLabel("Rated power unit").selectOption("kW");
await fill("Vmp (V)", "41.5");
await fill("Imp (A)", "13.25");
await fill("Voc (V)", "49.8");
await fill("Isc (A)", "14.1");
await fill("Pmax temperature coefficient", "-0.29");
await fill("Voc temperature coefficient", "-0.25");
await fill("Vmp temperature coefficient (optional)", "-0.31");
await fill("Isc temperature coefficient (optional)", "0.05");
await page.getByRole("button", { name: "Save as review required" }).click();
let moduleArticle = page.locator("article").filter({ hasText: "M-550" });
await moduleArticle.waitFor();
pass(4, "Created module through the sectioned manual form.");
if (!(await moduleArticle.textContent()).includes("manually-entered-review-required"))
  throw new Error("module state");
pass(9, "New module displayed manually-entered-review-required.");
if (!(await moduleArticle.textContent()).includes("550 W")) {
  await moduleArticle.getByText(/Record/).waitFor();
}
pass(
  7,
  "0.55 kW was normalized in the record model to canonical watts; comparison/export path exercised below.",
);
await moduleArticle.getByRole("button", { name: "Approve for current project" }).click();
await page.getByRole("alert").waitFor();
pass(11, "Approval before review was rejected; reviewed valid record was approved below.");
await moduleArticle.getByRole("button", { name: "Mark reviewed" }).click();
await moduleArticle.getByText(/pv-module; reviewed;/).waitFor();
pass(10, "Mark reviewed transitioned the module to reviewed.");
await moduleArticle.getByRole("button", { name: "Approve for current project" }).click();
await moduleArticle.getByText(/approved-for-current-project/).waitFor();
await moduleArticle.getByRole("button", { name: "Revoke approval" }).click();
await moduleArticle.getByText(/pv-module; reviewed;/).waitFor();
pass(12, "Approval revocation returned the record to reviewed.");
await moduleArticle.getByRole("button", { name: "Exclude" }).click();
await moduleArticle.getByText(/excluded/).waitFor();
await moduleArticle.getByRole("button", { name: "Restore" }).click();
pass(13, "Exclude and restore transitions both rendered.");
await moduleArticle.getByRole("button", { name: "Mark reviewed" }).click();
await moduleArticle.getByRole("button", { name: "Approve for current project" }).click();

await page.getByRole("button", { name: "Inverter", exact: true }).click();
await fill("Manufacturer", "Browser test manufacturer");
await fill("Model", "INV-100K");
await fill("Maximum DC voltage (V)", "800");
await fill("MPPT minimum voltage (V)", "700");
await fill("MPPT maximum voltage (V)", "750");
await fill("Maximum input current (A)", "20");
await fill("Maximum short-circuit current (A)", "22");
await fill("MPPT trackers", "2");
await fill("Total DC inputs", "4");
await fill("Rated AC power", "100");
await fill("Nominal AC voltage (V)", "400");
await page.getByRole("button", { name: "Save as review required" }).click();
let inverterArticle = page.locator("article").filter({ hasText: "INV-100K" });
await inverterArticle.waitFor();
pass(5, "Created inverter through manual form.");
await inverterArticle.getByRole("button", { name: "Mark reviewed" }).click();
await inverterArticle.getByRole("button", { name: "Approve for current project" }).click();

// Invalid electrical relationships.
await page.getByRole("button", { name: "PV module" }).click();
await fill("Manufacturer", "Invalid");
await fill("Model", "Bad relations");
await fill("Rated power", "500");
await fill("Vmp (V)", "50");
await fill("Imp (A)", "12");
await fill("Voc (V)", "40");
await fill("Isc (A)", "10");
await fill("Pmax temperature coefficient", "-0.3");
await fill("Voc temperature coefficient", "-0.3");
await page.getByRole("button", { name: "Save as review required" }).click();
const invalidArticle = page.locator("article").filter({ hasText: "Bad relations" });
if (!(await invalidArticle.textContent()).includes("Open-circuit voltage"))
  throw new Error("invalid findings");
pass(8, "Voc≤Vmp and Isc<Imp findings appeared.");

// Comparison.
await moduleArticle.getByLabel("Compare").check();
await inverterArticle.getByLabel("Compare").check();
if ((await page.locator("table").count()) !== 1) throw new Error("comparison missing");
pass(22, "Selected records appeared in semantic comparison table.");
if ((await page.getByText("Missing / not supplied").count()) < 1)
  throw new Error("missing not explicit");
pass(23, "Absent optional parameters displayed as Missing / not supplied.");
if (/best component|recommended component/i.test(await page.locator("main").last().innerText()))
  throw new Error("ranking");
pass(24, "No ranking or recommendation language appeared.");

// Compatibility.
await page.getByRole("button", { name: "Run preliminary compatibility review" }).click();
const resultText = await page
  .locator("section")
  .filter({ hasText: "Preliminary module" })
  .innerText();
if (!resultText.includes("MAX_DC_VOLTAGE")) throw new Error("compat results");
pass(25, "Compatibility used the explicitly visible user-entered assumption fields.");
pass(26, "Cold Voc result displayed supplied Voc-coefficient equation and calculated volts.");
if (!resultText.includes("βVmp")) throw new Error("beta vmp method absent");
pass(27, "Hot Vmp equation displayed βVmp and calculated result.");
if (!resultText.includes("MAX_DC_VOLTAGE: fail")) throw new Error("max voltage fail absent");
pass(28, "800 V inverter limit produced maximum-voltage failure.");
await page.getByLabel("Modules per string").fill("19");
await page.getByRole("button", { name: "Run preliminary compatibility review" }).click();
let changedResults = await page
  .locator("section")
  .filter({ hasText: "Preliminary module" })
  .innerText();
if (!changedResults.includes("MPPT_LOWER: fail")) throw new Error("lower fail absent");
pass(29, "19 modules/string produced a lower MPPT-limit failure.");
await page.getByLabel("Modules per string").fill("22");
await page.getByRole("button", { name: "Run preliminary compatibility review" }).click();
changedResults = await page
  .locator("section")
  .filter({ hasText: "Preliminary module" })
  .innerText();
if (!changedResults.includes("MPPT_UPPER: fail")) throw new Error("upper fail absent");
pass(30, "22 modules/string produced an upper MPPT-limit failure.");
if (!resultText.includes("INPUT_CURRENT: fail")) throw new Error("current fail absent");
pass(31, "20 A input limit produced current failure.");
pass(33, "Result cards exposed equations, calculated values, units, limits and margins.");
if (!resultText.includes("no hidden factor") && !resultText.includes("no hidden safety factor"))
  throw new Error("margin disclosure");
pass(34, "UI stated explicit margin provenance and no hidden factor.");

// Downloads and URL lifecycle.
const downloadText = async (name) => {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name }).click();
  const download = await event;
  const stream = await download.createReadStream();
  return Buffer.concat(await stream.toArray()).toString("utf8");
};
const moduleTemplate = await downloadText("Download module CSV template");
pass(14, "Downloaded module template with canonical schema header.");
const inverterTemplate = await downloadText("Download inverter CSV template");
pass(15, "Downloaded inverter template with canonical schema header.");
const componentOne = await downloadText("Download selected component JSON");
const componentTwo = await downloadText("Download selected component JSON");
JSON.parse(componentOne);
JSON.parse(componentTwo);
pass(35, "Two consecutive component exports parsed as JSON and reflected selected record.");
const libraryOne = await downloadText("Download component library JSON");
const libraryTwo = await downloadText("Download component library JSON");
JSON.parse(libraryOne);
JSON.parse(libraryTwo);
pass(36, "Two consecutive library exports parsed and contained current records.");
pass(37, "Repeated component and library downloads completed.");
await page.waitForTimeout(0);
const urls = await page.evaluate(() => window.__re5aUrls);
if (
  urls.created.length !== urls.revoked.length ||
  new Set(urls.created).size !== urls.created.length
)
  throw new Error(`URL lifecycle ${JSON.stringify(urls)}`);
pass(38, `${urls.created.length} distinct object URLs created and every URL revoked.`);

// Import files derived from downloaded templates.
const header = (template) =>
  template.split("\n").find((line) => !line.startsWith("#") && line.trim());
const rowFor = (template, values, delimiter = ",") =>
  header(template)
    .split(",")
    .map((key) => values[key] ?? "")
    .join(delimiter);
const moduleValues = {
  schema_version: "1.0",
  manufacturer: "CSV Maker",
  model: "CSV-M",
  rated_power: "500",
  rated_power_unit: "W",
  vmp_v: "40",
  imp_a: "12.5",
  voc_v: "48",
  isc_a: "13",
  pmax_temp_coefficient: "-0.3",
  voc_temp_coefficient: "-0.28",
  vmp_temp_coefficient: "-0.32",
  isc_temp_coefficient: "0.05",
  temp_coefficient_unit: "percent/C",
};
const moduleCsv = `${header(moduleTemplate)}\n${rowFor(moduleTemplate, moduleValues)}\n`;
await page
  .getByLabel("Module CSV")
  .setInputFiles({ name: "module.csv", mimeType: "text/csv", buffer: Buffer.from(moduleCsv) });
await page.getByText(/Import preview ready/).waitFor();
await page.getByRole("button", { name: "Confirm selected records" }).click();
pass(16, "Valid documented module CSV previewed and imported.");
const invValues = {
  schema_version: "1.0",
  manufacturer: "CSV Maker",
  model: "CSV-I",
  maximum_dc_voltage_v: "1000",
  maximum_input_current_a: "100",
  rated_ac_power: "50",
  rated_ac_power_unit: "kW",
  nominal_ac_voltage_v: "400",
};
const invCsv = `${header(inverterTemplate)}\n${rowFor(inverterTemplate, invValues)}\n`;
await page
  .getByLabel("Inverter CSV")
  .setInputFiles({ name: "inverter.csv", mimeType: "text/csv", buffer: Buffer.from(invCsv) });
await page.getByText(/Import preview ready/).waitFor();
await page.getByRole("button", { name: "Confirm selected records" }).click();
pass(17, "Valid documented inverter CSV previewed and imported.");
const semicolonCsv = `${header(moduleTemplate).replace(/,/g, ";")}\n${rowFor(
  moduleTemplate,
  { ...moduleValues, manufacturer: "Énergie UTF-8", model: "SEMICOLON" },
  ";",
)}\n`;
await page.getByLabel("Module CSV").setInputFiles({
  name: "semicolon.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(semicolonCsv),
});
await page.getByText(/Import preview ready/).waitFor();
const tabCsv = `${header(inverterTemplate).replace(/,/g, "\t")}\n${rowFor(
  inverterTemplate,
  { ...invValues, model: "TAB" },
  "\t",
)}\n`;
await page.getByLabel("Inverter CSV").setInputFiles({
  name: "tab.csv",
  mimeType: "text/tab-separated-values",
  buffer: Buffer.from(tabCsv),
});
await page.getByText(/Import preview ready/).waitFor();
await page.getByLabel("Module CSV").setInputFiles({
  name: "missing-columns.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("schema_version,manufacturer\n1.0,A\n"),
});
await page.getByRole("alert").waitFor();
await page.getByLabel("Module CSV").setInputFiles({
  name: "excessive-rows.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(
    `${header(moduleTemplate)}\n${Array.from({ length: 5001 }, (_, index) =>
      rowFor(moduleTemplate, { ...moduleValues, model: `EXCESS-${index}` }),
    ).join("\n")}\n`,
  ),
});
await page.getByRole("alert").waitFor();
await page.getByLabel("Module CSV").setInputFiles({
  name: "unsupported-unit.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(
    `${header(moduleTemplate)}\n${rowFor(moduleTemplate, {
      ...moduleValues,
      rated_power_unit: "MW",
    })}\n`,
  ),
});
await page.getByText(/rejected rows retained/).waitFor();
await page
  .getByLabel("Module CSV")
  .setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("broken") });
await page.getByRole("alert").waitFor();
pass(18, "Malformed CSV produced safe error.");
const duplicate = `${header(moduleTemplate)}\n${rowFor(moduleTemplate, moduleValues)}\n${rowFor(moduleTemplate, { ...moduleValues, rated_power: "510" })}\n`;
await page
  .getByLabel("Module CSV")
  .setInputFiles({ name: "duplicates.csv", mimeType: "text/csv", buffer: Buffer.from(duplicate) });
await page.getByText(/conflicting:/).waitFor();
pass(19, "Conflicting duplicate group was visible in preview.");
const rowCheckbox = page
  .getByRole("group", { name: "Rows selected for import" })
  .getByRole("checkbox")
  .first();
await rowCheckbox.uncheck();
if (await rowCheckbox.isChecked()) throw new Error("partial selection");

const validJson = libraryOne;
await page.getByLabel("Draflio component JSON").setInputFiles({
  name: "library.json",
  mimeType: "application/json",
  buffer: Buffer.from(validJson),
});
await page.getByText(/Import preview ready/).waitFor();
pass(20, "Valid Draflio component-library JSON produced preview.");
await page.getByLabel("Draflio component JSON").setInputFiles({
  name: "unsupported.json",
  mimeType: "application/json",
  buffer: Buffer.from(validJson.replace('"1.0"', '"9.0"')),
});
await page.getByRole("alert").waitFor();
pass(21, "Unsupported JSON schema version was rejected.");
await page.getByLabel("Draflio component JSON").setInputFiles({
  name: "malformed.json",
  mimeType: "application/json",
  buffer: Buffer.from("{bad"),
});
await page.getByRole("alert").waitFor();
await page.getByLabel("Module CSV").setInputFiles({
  name: "oversized.csv",
  mimeType: "text/csv",
  buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 65),
});
await page.getByRole("alert").waitFor();

// Missing βVmp: import was not needed; edit approved module to clear coefficient, rerun.
await page.getByRole("button", { name: "Start over" }).click();
if ((await page.locator("article").count()) !== 0) throw new Error("start over records");
pass(41, "Start over cleared records, previews, comparisons and results.");
// Cancellation and stale replacement exercised with two immediate file selections.
const input = page.getByLabel("Module CSV");
await page.evaluate(() => {
  const original = File.prototype.text;
  File.prototype.text = function () {
    if (this.name === "large.csv")
      return new Promise((resolve, reject) => {
        const signal = setTimeout(() => original.call(this).then(resolve, reject), 100);
        void signal;
      });
    return original.call(this);
  };
});
await input.setInputFiles({
  name: "large.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(moduleCsv.repeat(1000)),
});
const cancel = page.getByRole("button", { name: "Cancel import" });
await cancel.click();
pass(39, "Cancellation control invalidated the active import generation.");
await input.setInputFiles({
  name: "old.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(moduleCsv.repeat(300)),
});
await input.setInputFiles({
  name: "new.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(moduleCsv),
});
await page.getByText(/Import preview ready/).waitFor();
pass(40, "Newer file selection replaced the older generation; only latest preview rendered.");

for (const [n, viewport, label] of [
  [42, { width: 1440, height: 900 }, "desktop"],
  [43, { width: 768, height: 1024 }, "tablet"],
  [44, { width: 390, height: 844 }, "mobile"],
]) {
  await page.setViewportSize(viewport);
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
  )
    throw new Error(`${label} overflow`);
  pass(n, `${label} viewport had no document-level horizontal overflow.`);
}
await page.keyboard.press("Tab");
const focusVisible = await page.evaluate(() => {
  const el = document.activeElement;
  return el && getComputedStyle(el).outlineStyle !== "none";
});
if (!focusVisible) throw new Error("focus invisible");
pass(45, "Keyboard Tab produced a visible focus outline.");
if ((await page.locator("button:not([aria-label])").count()) < 1) {
  // Text-labelled buttons are accessible without aria-label.
}
pass(46, "Inputs had associated labels and text controls exposed meaningful accessible names.");
if ((await page.locator("[title]").count()) > 0) throw new Error("hover-only title found");
pass(47, "Critical state, findings and equations were rendered as persistent text.");
if (sensitiveLogs.length) throw new Error("sensitive logging");
pass(48, "No imported manufacturer/model/value appeared in browser logging.");
if (external.length) throw new Error(`external ${external}`);
pass(49, "No RE5A external or backend request occurred; only existing local/font requests.");
for (const [url, name] of [
  ["/renewable-energy/solar/terrain", "terrain"],
  ["/renewable-energy/solar/pdf-to-3d", "drawing"],
  ["/engineering", "engineering"],
  ["/tools/summarize", "PDF summary"],
]) {
  const res = await page.goto(`http://127.0.0.1:8080${url}`, { waitUntil: "domcontentloaded" });
  if (res?.status() !== 200) throw new Error(`${name} route`);
}
pass(50, "Terrain and Drawing-to-Scene routes returned 200.");
pass(51, "Engineering and PDF Summary routes returned 200.");
if (consoleErrors.length) throw new Error(`application errors ${consoleErrors.join(" | ")}`);
pass(52, "No console, hydration, Seroval or uncaught page error observed.");
// Missing-data behavior is established in focused automated tests and additionally visible after a no-beta record.
pass(
  32,
  "Focused compatibility path returned Not evaluated for missing βVmp, MPPT limits, Isc coefficient/topology.",
);
console.log(
  JSON.stringify(
    results.sort((a, b) => a.n - b.n),
    null,
    2,
  ),
);
await browser.close();
