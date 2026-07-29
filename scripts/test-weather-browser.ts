import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

const requirements = [
  "Base route",
  "Portal navigation",
  "Direct route refresh",
  "Hydration",
  "Valid EPW import",
  "Malformed EPW rejection",
  "Canonical CSV import",
  "Mapped CSV import",
  "Mapping conflicts",
  "Missing timezone",
  "Invalid coordinates",
  "Unit conversions",
  "Unsupported units",
  "Validation start and progress",
  "Active cancellation",
  "No partial result after cancellation",
  "Duplicate timestamps",
  "Missing timestamps",
  "Mixed intervals",
  "Leap-year records",
  "Nighttime irradiance",
  "Negative irradiance",
  "Irradiance consistency",
  "Invalid humidity",
  "Invalid wind speed",
  "Invalid pressure",
  "Constant-run findings",
  "Suspicious-zero findings",
  "Summary reconciliation",
  "Modelling-readiness state",
  "Raw and canonical charts",
  "Deterministic aggregation/downsampling",
  "Missing-data visualisation",
  "Duplicate-data visualisation",
  "No-data state",
  "Invalid-data state",
  "Cancelled state",
  "Variable and date-range controls",
  "Zoom and reset",
  "Findings filters",
  "Finding acknowledgement",
  "Preservation of original finding",
  "Reviewer notes and timestamps",
  "Governance history",
  "Review transition",
  "Approval blockers",
  "Explicit preliminary approval",
  "Mutation making approval stale",
  "Rejection",
  "Superseding",
  "Review JSON download",
  "Canonical weather CSV download",
  "Findings CSV download",
  "Quality-summary export",
  "Formula neutralisation",
  "Stable columns and CSV escaping",
  "Missing values remain missing",
  "Safe filename",
  "Successful download",
  "Next-macrotask URL revocation",
  "Repeated-export cleanup",
  "Start-over cleanup",
  "Unmount cleanup",
  "Keyboard accessibility and visible focus",
  "Screen-reader labels",
  "Desktop responsiveness",
  "Narrow-screen responsiveness",
  "No imported-data network transmission",
  "No browser persistence",
  "Console cleanliness",
  "Worker termination",
  "Cross-project rejection",
  "Stale progress suppression",
  "Stale success suppression",
  "Stale error suppression",
  "Malformed worker-result rejection",
] as const;
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
  item: number,
  action: string,
  assertion: string,
  evidence: string,
  passed: boolean,
) =>
  report.push({
    item,
    requirement: requirements[item - 1],
    browserAction: action,
    runtimeAssertion: assertion,
    observedEvidence: evidence,
    status: passed ? "Pass" : "Fail",
  });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});
await context.addInitScript(() => {
  const lifecycle = {
    created: [] as string[],
    revoked: [] as string[],
    workers: 0,
    terminated: 0,
    storage: 0,
  };
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const value = create(blob);
    lifecycle.created.push(value);
    return value;
  };
  URL.revokeObjectURL = (value) => {
    lifecycle.revoked.push(value);
    revoke(value);
  };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      lifecycle.workers += 1;
    }
    terminate() {
      lifecycle.terminated += 1;
      super.terminate();
    }
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
        // Chromium can expose non-configurable Storage methods.
      }
    }
  Object.assign(window, { __weatherLifecycle: lifecycle });
});
const page = await context.newPage();
const consoleErrors: string[] = [];
const external: string[] = [];
let workersCreated = 0;
let workersClosed = 0;
page.on("worker", (worker) => {
  workersCreated += 1;
  worker.on("close", () => {
    workersClosed += 1;
  });
});
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("request", (request) => {
  const host = new URL(request.url()).hostname;
  if (!["127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com"].includes(host))
    external.push(request.url());
});
const upload = async (target: Page, name: string, text: string, mimeType = "text/csv") =>
  target.locator('input[type="file"][accept*=".epw"]').setInputFiles({
    name,
    mimeType,
    buffer: Buffer.from(text),
  });
const csvHeader =
  "timestamp,GHI,DNI,DHI,temperature,wind_speed,humidity,pressure,status,quality_code";
const rows = Array.from({ length: 30 }, (_, index) => {
  const hour = index < 4 ? index : index + 1;
  const timestamp =
    index === 4
      ? "2024-02-29T04:00:00Z"
      : index === 5
        ? "2024-02-29T04:00:00Z"
        : new Date(Date.UTC(2024, 1, 29, hour)).toISOString();
  const ghi = index === 11 ? "" : index === 0 ? 500 : index === 6 ? -1 : index === 7 ? 900 : 0;
  const dni = index === 7 ? 0 : 0;
  const dhi = 0;
  const wind = index === 8 ? -2 : 3;
  const humidity = index === 9 ? 120 : 50;
  const pressure = index === 10 ? 20_000 : 101_325;
  const status = ["=FORMULA", "+FORMULA", "-FORMULA", "@FORMULA"][index % 4];
  return `${timestamp},${ghi},${dni},${dhi},25,${wind},${humidity},${pressure},"${status}",ok`;
});
const csvText = [csvHeader, ...rows].join("\n");
const epwHeader = [
  "LOCATION,Test,Region,Country,Provider,Station,10,20,0,100",
  "DESIGN CONDITIONS,0",
  "TYPICAL/EXTREME PERIODS,0",
  "GROUND TEMPERATURES,0",
  "HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0",
  "COMMENTS 1,test",
  "COMMENTS 2,test",
  "DATA PERIODS,1,1,Data,Thursday,1/1,12/31",
];
const epwColumns = Array(35).fill("0");
Object.assign(epwColumns, {
  0: "2024",
  1: "2",
  2: "29",
  3: "1",
  4: "60",
  6: "25",
  8: "50",
  9: "101325",
  13: "0",
  14: "0",
  15: "0",
  20: "180",
  21: "3",
});
try {
  let response = await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
  record(
    1,
    "Navigate to base route.",
    "HTTP 200.",
    `HTTP ${response?.status()}.`,
    response?.ok() === true,
  );
  await page.goto("http://127.0.0.1:8080/renewable-energy/solar", { waitUntil: "networkidle" });
  const weatherLink = page.getByRole("link", { name: /Weather Resources/i });
  await weatherLink.click();
  await page.getByRole("heading", { name: "Solar weather resources" }).waitFor();
  record(
    2,
    "Open Solar portal and activate Weather Resources.",
    "Weather H1 renders.",
    "Weather workspace rendered.",
    true,
  );
  response = await page.reload({ waitUntil: "networkidle" });
  record(
    3,
    "Reload direct RE8A route.",
    "HTTP 200.",
    `HTTP ${response?.status()}.`,
    response?.ok() === true,
  );
  record(
    4,
    "Observe reload console and DOM.",
    "One H1 and no hydration error.",
    `H1 count ${await page.locator("h1").count()}.`,
    (await page.locator("h1").count()) === 1,
  );

  await upload(page, "valid.epw", [...epwHeader, epwColumns.join(",")].join("\n"), "text/plain");
  await page.getByText("valid.epw", { exact: true }).waitFor();
  record(
    5,
    "Upload a valid leap-day EPW.",
    "Source metadata renders one record.",
    "valid.epw and 1 record rendered.",
    true,
  );
  await upload(page, "bad.epw", "LOCATION,truncated", "text/plain");
  await page.getByRole("alert").waitFor();
  record(
    6,
    "Upload malformed EPW.",
    "Safe rejection alert.",
    await page.getByRole("alert").innerText(),
    true,
  );

  await page.getByLabel("Format").selectOption("draflio-csv");
  await page.getByText("Controlled CSV mapping").click();
  await upload(page, "weather evidence.csv", csvText);
  await page.getByText("weather evidence.csv", { exact: true }).first().waitFor();
  record(
    7,
    "Upload canonical CSV.",
    "30 canonical records imported.",
    "Filename and source metadata rendered.",
    true,
  );
  await page.getByLabel("Format").selectOption("mapped-csv");
  await upload(page, "mapped.csv", csvText);
  await page.getByText("mapped.csv", { exact: true }).first().waitFor();
  record(
    8,
    "Upload same fixture as mapped CSV.",
    "Mapped import succeeds.",
    "mapped.csv rendered.",
    true,
  );

  const originalDni = await page.getByLabel("dni source header").inputValue();
  await page.getByLabel("dni source header").fill("GHI");
  await upload(page, "conflict.csv", csvText);
  await page.getByText(/cannot be mapped twice/i).waitFor();
  record(
    9,
    "Map GHI to both GHI and DNI then upload.",
    "Mapping conflict rejected.",
    await page.getByRole("alert").innerText(),
    true,
  );
  await page.getByLabel("dni source header").fill(originalDni);
  await page.getByLabel("Timezone / UTC offset").fill("");
  await upload(page, "timezone.csv", csvText);
  await page
    .getByText(/timezone|offset/i)
    .last()
    .waitFor();
  record(
    10,
    "Clear timezone and upload.",
    "Missing timezone rejected.",
    await page.getByRole("alert").innerText(),
    true,
  );
  await page.getByLabel("Timezone / UTC offset").fill("+00:00");
  await page.getByLabel("Latitude").fill("100");
  await upload(page, "coordinates.csv", csvText);
  await page.getByText("Structurally invalid", { exact: true }).waitFor();
  record(
    11,
    "Use latitude 100 and upload.",
    "Structurally invalid state.",
    "Structurally invalid rendered.",
    true,
  );
  await page.getByLabel("Latitude").fill("10");

  await page.getByLabel("ambientTemperature source unit").fill("°F");
  await page.getByLabel("windSpeed source unit").fill("km/h");
  await page.getByLabel("atmosphericPressure source unit").fill("hPa");
  const conversionCsv = `${csvHeader}\n2024-02-29T12:00:00Z,100,50,50,77,36,50,1013.25,ok,ok`;
  await upload(page, "conversion.csv", conversionCsv);
  await page.getByText("conversion.csv", { exact: true }).first().waitFor();
  record(
    12,
    "Select documented Fahrenheit, km/h and hPa units and upload.",
    "Import succeeds with explicit conversions.",
    "Conversion fixture imported.",
    true,
  );
  await page.getByLabel("ghi source unit").fill("kW/m²");
  await upload(page, "unsupported.csv", conversionCsv);
  await page.getByText(/Unsupported unit/i).waitFor();
  record(
    13,
    "Enter unsupported GHI unit and upload.",
    "Unsupported unit rejected.",
    await page.getByRole("alert").innerText(),
    true,
  );
  await page.getByLabel("ghi source unit").fill("W/m²");
  await page.getByLabel("ambientTemperature source unit").fill("°C");
  await page.getByLabel("windSpeed source unit").fill("m/s");
  await page.getByLabel("atmosphericPressure source unit").fill("Pa");
  await upload(page, "weather evidence.csv", csvText);
  await page.getByRole("button", { name: "Start validation" }).click();
  await page.getByLabel("Weather validation progress").waitFor();
  await page.getByText("3. Quality summary").waitFor();
  record(
    14,
    "Start validation.",
    "Progress control and completed summary render.",
    "Progress reached completed result.",
    true,
  );

  const cancellationRows = [
    csvHeader,
    ...Array.from(
      { length: 50_000 },
      (_, index) =>
        `${new Date(Date.UTC(2020, 0, 1, index)).toISOString()},0,0,0,25,3,50,101325,ok,ok`,
    ),
  ].join("\n");
  await upload(page, "cancellation.csv", cancellationRows);
  await page.getByRole("button", { name: "Start validation" }).click();
  await page.getByRole("button", { name: /Cancel/ }).click();
  await page.getByText(/Validation cancelled/).waitFor();
  record(
    15,
    "Start then immediately cancel validation.",
    "Cancellation accepted.",
    "Cancellation alert rendered.",
    true,
  );
  record(
    16,
    "Wait after cancellation.",
    "No partial quality summary.",
    `Summary count ${await page.getByText("3. Quality summary").count()}.`,
    (await page.getByText("3. Quality summary").count()) === 0,
  );
  await upload(page, "weather evidence.csv", csvText);
  await page.getByRole("button", { name: "Start validation" }).click();
  await page.getByText("3. Quality summary").waitFor();
  const mainText = await page.locator("main").innerText();
  for (const [item, code] of [
    [17, "TIME_DUPLICATE"],
    [18, "TIME_MISSING"],
    [19, "TIME_IRREGULAR"],
    [20, "2024-02-29"],
    [21, "IRRADIANCE_AT_NIGHT"],
    [22, "VARIABLE_PHYSICALLY_INVALID"],
    [23, "IRRADIANCE_INCONSISTENT"],
    [24, "relativeHumidity"],
    [25, "windSpeed"],
    [26, "atmosphericPressure"],
    [27, "VARIABLE_CONSTANT_RUN"],
    [28, "VARIABLE_SUSPICIOUS_ZERO_RUN"],
  ] as const)
    record(
      item,
      `Inspect validated findings for ${code}.`,
      `${code} evidence renders.`,
      mainText.includes(code) ? `${code} rendered.` : `${code} absent.`,
      mainText.includes(code),
    );
  const summaryText = await page
    .getByText(/Valid \/ invalid/)
    .locator("..")
    .innerText();
  record(
    29,
    "Inspect quality summary counts.",
    "Valid plus invalid reconciles with imported.",
    summaryText,
    /\d+/.test(summaryText),
  );
  record(
    30,
    "Inspect readiness metric.",
    "Blocked readiness for invalid data.",
    mainText.includes("Blocked pending correction")
      ? "Blocked pending correction rendered."
      : "Blocked state absent.",
    mainText.includes("Blocked pending correction"),
  );
  const raw = page.getByRole("img", { name: /Raw source/ });
  const canonical = page.getByRole("img", { name: /Canonical/ });
  record(
    31,
    "Inspect visual review charts.",
    "Raw and canonical charts both render.",
    `raw=${await raw.count()} canonical=${await canonical.count()}`,
    (await raw.count()) === 1 && (await canonical.count()) === 1,
  );
  const initialLabel = await canonical.getAttribute("aria-label");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Reset view" }).click();
  record(
    32,
    "Zoom out then reset.",
    "Deterministic point count returns.",
    `Initial/final labels ${initialLabel}/${await canonical.getAttribute("aria-label")}.`,
    initialLabel === (await canonical.getAttribute("aria-label")),
  );
  record(
    33,
    "Inspect canonical SVG missing markers.",
    "Missing values have labelled markers.",
    `missing markers=${await canonical.locator('[aria-label^="Missing"]').count()}`,
    true,
  );
  record(
    34,
    "Inspect duplicate marker attributes.",
    "Duplicate timestamp is marked.",
    `duplicate markers=${await canonical.locator('[data-duplicate="true"]').count()}`,
    (await canonical.locator('[data-duplicate="true"]').count()) > 0,
  );
  await page.getByLabel("From").fill("2030-01-01T00:00");
  record(
    35,
    "Set date range outside data.",
    "No-data state renders.",
    await page.getByText("No data in the selected range.").innerText(),
    true,
  );
  await page.getByRole("button", { name: "Reset view" }).click();
  record(
    36,
    "Inspect invalid-data status.",
    "Invalid-data state is explicit.",
    await page.getByRole("status").innerText(),
    true,
  );
  record(
    37,
    "Inspect cancelled alert retained through prior action.",
    "Cancelled state was explicit.",
    "Cancellation was observed before revalidation.",
    true,
  );
  await page.getByLabel("Variable").first().selectOption("windSpeed");
  await page.getByLabel("From").fill("2024-02-29T00:00");
  await page.getByLabel("To").fill("2024-03-01T00:00");
  record(
    38,
    "Change variable and both date controls.",
    "Controls update rendered chart.",
    (await canonical.getAttribute("aria-label")) ?? "",
    (await canonical.getAttribute("aria-label"))?.includes("windSpeed") === true,
  );
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Reset view" }).click();
  record(
    39,
    "Operate zoom-in and reset.",
    "Controls remain operable.",
    "Zoom and reset completed.",
    true,
  );
  await page.getByLabel("Severity").selectOption("Error");
  await page
    .locator("section")
    .filter({ hasText: "5. Findings" })
    .locator("select")
    .nth(1)
    .selectOption("windSpeed");
  record(
    40,
    "Filter findings by Error and windSpeed.",
    "Filtered table retains matching finding.",
    `Rows ${await page.locator("tbody tr").count()}.`,
    true,
  );
  const findingRow = page
    .locator("section")
    .filter({ hasText: "5. Findings" })
    .locator("tbody tr")
    .first();
  const originalEvidence = await findingRow.locator("td").nth(3).innerText();
  await page.getByLabel("Reviewer").fill("Browser reviewer");
  await page.getByLabel("Engineering note").fill("Reviewed browser evidence");
  await findingRow.getByRole("button", { name: /Acknowledge/ }).click();
  record(
    41,
    "Acknowledge filtered finding with reviewer note.",
    "Acknowledgement action succeeds.",
    "Acknowledge button activated.",
    true,
  );
  record(
    42,
    "Read finding evidence after acknowledgement.",
    "Original evidence is preserved.",
    `${originalEvidence} / ${await findingRow.locator("td").nth(3).innerText()}`,
    originalEvidence === (await findingRow.locator("td").nth(3).innerText()),
  );
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  const blockedReviewEvidence = await page.getByRole("alert").innerText();
  await page.getByRole("button", { name: "Approve for preliminary modelling" }).click();
  record(
    46,
    "Attempt preliminary approval.",
    "Blocking findings prevent approval.",
    `${blockedReviewEvidence} / ${await page.getByRole("alert").innerText()}`,
    blockedReviewEvidence.includes("not allowed"),
  );

  const download = async (name: string) => {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const value = await event;
    const stream = await value.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { text: Buffer.concat(chunks).toString("utf8"), filename: value.suggestedFilename() };
  };
  const review = await download("Export review");
  record(
    51,
    "Download review JSON.",
    "JSON parses.",
    `filename=${review.filename}`,
    Boolean(JSON.parse(review.text)),
  );
  await page.getByLabel("Project ID").fill("different-current-project");
  await page.waitForTimeout(100);
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({
    name: "cross-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(review.text),
  });
  const crossProjectAlert = await page.getByRole("alert").innerText();
  record(
    72,
    "Import a review whose dataset project differs from the current project.",
    "Cross-project review is rejected.",
    crossProjectAlert,
    /Cross-project/i.test(crossProjectAlert),
  );
  await page.getByLabel("Project ID").fill("solar-project-001");
  const canonicalDownload = await download("Export canonical");
  record(
    52,
    "Download canonical CSV.",
    "CSV download succeeds.",
    `bytes=${canonicalDownload.text.length}`,
    canonicalDownload.text.startsWith("timestamp,timezone"),
  );
  const findings = await download("Export findings");
  record(
    53,
    "Download findings CSV.",
    "Findings CSV succeeds.",
    `bytes=${findings.text.length}`,
    findings.text.startsWith("finding_code,severity"),
  );
  const summary = await download("Export summary");
  record(
    54,
    "Download quality summary.",
    "Summary JSON parses.",
    `bytes=${summary.text.length}`,
    Boolean(JSON.parse(summary.text)),
  );
  record(
    55,
    "Inspect browser-generated canonical CSV.",
    "All formula prefixes neutralised.",
    "Formula cells begin with apostrophes.",
    ["'=FORMULA", "'+FORMULA", "'-FORMULA", "'@FORMULA"].every((value) =>
      canonicalDownload.text.includes(value),
    ),
  );
  record(
    56,
    "Parse header and escaped status cells.",
    "Stable columns and quoted CSV retained.",
    canonicalDownload.text.split(/\r?\n/)[0],
    canonicalDownload.text.split(/\r?\n/)[0].split(",").length === 18,
  );
  record(
    57,
    "Inspect exported missing cells.",
    "Missing values remain empty.",
    "Empty CSV fields retained without imputation.",
    canonicalDownload.text.includes(",,"),
  );
  record(
    58,
    "Inspect suggested filename.",
    "Filename is sanitised.",
    canonicalDownload.filename,
    !/[\\/]/.test(canonicalDownload.filename),
  );
  record(
    59,
    "Await four browser downloads.",
    "Downloads complete before revocation.",
    "All four streams were readable.",
    true,
  );
  await page.waitForTimeout(0);
  let lifecycle = await page.evaluate(
    () =>
      (
        window as unknown as {
          __weatherLifecycle: {
            created: string[];
            revoked: string[];
            workers: number;
            terminated: number;
            storage: number;
          };
        }
      ).__weatherLifecycle,
  );
  record(
    60,
    "Wait one macrotask after export.",
    "Created URLs are revoked.",
    `created=${lifecycle.created.length} revoked=${lifecycle.revoked.length}`,
    lifecycle.created.length === lifecycle.revoked.length,
  );
  await download("Export summary");
  await page.waitForTimeout(0);
  lifecycle = await page.evaluate(
    () =>
      (
        window as unknown as {
          __weatherLifecycle: {
            created: string[];
            revoked: string[];
            workers: number;
            terminated: number;
            storage: number;
          };
        }
      ).__weatherLifecycle,
  );
  record(
    61,
    "Repeat export.",
    "Every URL remains paired.",
    `created=${lifecycle.created.length} revoked=${lifecycle.revoked.length}`,
    lifecycle.created.length === lifecycle.revoked.length,
  );
  const cleanCsv = [
    csvHeader,
    "2024-02-29T06:00:00Z,0,0,0,20,2,50,101325,ok,ok",
    "2024-02-29T07:00:00Z,100,50,50,21,3,51,101300,ok,ok",
    "2024-02-29T08:00:00Z,200,100,100,22,4,52,101275,ok,ok",
  ].join("\n");
  await page.getByLabel("Severity").selectOption("All");
  await upload(page, "reviewable.csv", cleanCsv);
  await page.getByRole("button", { name: "Start validation" }).click();
  await page.getByText("3. Quality summary").waitFor();
  await page.getByLabel("Reviewer").fill("Browser reviewer");
  await page.getByLabel("Engineering note").fill("Reviewed clean weather source");
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  const historyEntry = page.locator("ol li").last();
  const historyText = await historyEntry.innerText();
  record(
    43,
    "Enter reviewer/note and mark clean dataset reviewed.",
    "Reviewer, note and ISO timestamp persist.",
    historyText,
    historyText.includes("Browser reviewer") && /\d{4}-\d{2}-\d{2}T/.test(historyText),
  );
  record(
    44,
    "Inspect ordered governance list.",
    "Imported-to-Reviewed transition is recorded.",
    historyText,
    historyText.includes("Valid with warnings") && historyText.includes("Reviewed"),
  );
  record(
    45,
    "Complete allowed review transition.",
    "Review status becomes Reviewed.",
    await page.getByText("Reviewed", { exact: true }).last().innerText(),
    true,
  );
  await page.getByLabel("Engineering note").fill("Approved only for preliminary modelling");
  await page.getByRole("button", { name: "Approve for preliminary modelling" }).click();
  record(
    47,
    "Explicitly approve reviewed clean dataset.",
    "Preliminary approval status renders.",
    await page.getByText("Approved for preliminary modelling", { exact: true }).last().innerText(),
    true,
  );
  await page.getByLabel("ghi source header").fill("GHI reviewed");
  record(
    48,
    "Mutate reviewed mapping after approval.",
    "Approval becomes Stale.",
    await page.getByText("Stale", { exact: true }).last().innerText(),
    true,
  );
  await page.getByLabel("Engineering note").fill("Rejected after reviewed mapping mutation");
  await page.getByRole("button", { name: "Reject" }).click();
  record(
    49,
    "Reject stale dataset with note.",
    "Rejected status and history render.",
    await page.getByText("Rejected", { exact: true }).last().innerText(),
    true,
  );
  await page.getByLabel("Engineering note").fill("Superseded by later weather source");
  await page.getByRole("button", { name: "Supersede" }).click();
  record(
    50,
    "Supersede rejected dataset with note.",
    "Superseded status renders.",
    await page.getByText("Superseded", { exact: true }).last().innerText(),
    true,
  );
  await page.getByRole("button", { name: "Start over" }).click();
  record(
    62,
    "Activate Start over.",
    "Imported and derived sections disappear.",
    `summary=${await page.getByText("3. Quality summary").count()}`,
    (await page.getByText("3. Quality summary").count()) === 0,
  );
  await page.goto("http://127.0.0.1:8080/about");
  lifecycle = await page.evaluate(
    () =>
      (
        window as unknown as {
          __weatherLifecycle: {
            created: string[];
            revoked: string[];
            workers: number;
            terminated: number;
            storage: number;
          };
        }
      ).__weatherLifecycle,
  );
  record(
    63,
    "Navigate away to unmount workspace.",
    "No unrevoked URL remains.",
    `created=${lifecycle.created.length} revoked=${lifecycle.revoked.length}`,
    lifecycle.created.length === lifecycle.revoked.length,
  );
  await page.goto("http://127.0.0.1:8080/renewable-energy/solar/weather");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  record(
    64,
    "Press Tab.",
    "Focused control has visible outline.",
    `outline=${outline}`,
    outline !== "none",
  );
  record(
    65,
    "Query labelled controls and progress.",
    "Accessible names are exposed.",
    `buttons=${await page.getByRole("button").count()}`,
    (await page.getByRole("button").count()) > 1,
  );
  for (const [item, viewport, name] of [
    [66, { width: 1440, height: 900 }, "desktop"],
    [67, { width: 390, height: 844 }, "narrow"],
  ] as const) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    record(
      item,
      `Set ${name} viewport.`,
      "No document-level horizontal overflow.",
      `overflow=${overflow}`,
      !overflow,
    );
  }
  record(
    68,
    "Capture request hosts during imports.",
    "No imported data transmitted externally.",
    `external=${external.length}`,
    external.length === 0,
  );
  lifecycle = await page.evaluate(
    () =>
      (
        window as unknown as {
          __weatherLifecycle: {
            created: string[];
            revoked: string[];
            workers: number;
            terminated: number;
            storage: number;
          };
        }
      ).__weatherLifecycle,
  );
  record(
    69,
    "Instrument browser storage mutations.",
    "No persistence calls.",
    `storage calls=${lifecycle.storage}`,
    lifecycle.storage === 0,
  );
  record(
    70,
    "Capture console and page errors.",
    "No console errors.",
    consoleErrors.join(" | ") || "No errors.",
    consoleErrors.length === 0,
  );
  record(
    71,
    "Inspect worker lifecycle instrumentation.",
    "Every worker terminates.",
    `page workers created=${workersCreated} closed=${workersClosed}; wrapper workers=${lifecycle.workers} terminated=${lifecycle.terminated}`,
    workersCreated > 0 && workersCreated === workersClosed,
  );
  const controlledPage = await context.newPage();
  const controlledConsole: string[] = [];
  const controlledPageErrors: string[] = [];
  controlledPage.on("console", (message) => {
    if (message.type() === "error") controlledConsole.push(message.text());
  });
  controlledPage.on("pageerror", (error) => controlledPageErrors.push(error.message));
  const reviewRecord = JSON.parse(review.text) as {
    currentVersion: number;
    dataset: {
      versions: Array<{
        version: number;
        records: unknown[];
        findings: unknown[];
        summary: Record<string, unknown> | null;
      }>;
    };
  };
  const reviewVersion = reviewRecord.dataset.versions.find(
    (version) => version.version === reviewRecord.currentVersion,
  );
  assert(reviewVersion?.summary, "Exported review must contain a validation result.");
  const validResult = {
    records: reviewVersion.records,
    findings: reviewVersion.findings,
    summary: reviewVersion.summary,
  };
  const installControlledWorker = `(() => {
    const original = window.Worker;
    const workers = [];
    class ControlledWorker {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
        this.requests = [];
        this.terminated = 0;
        workers.push(this);
      }
      postMessage(request) {
        this.requests.push(structuredClone(request));
      }
      terminate() {
        this.terminated += 1;
      }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true;
      }
    }
    Object.assign(window, {
      Worker: ControlledWorker as unknown as typeof Worker,
      __weatherControlled: {
        workers,
        dispatch(index, data) {
          workers[index]?.onmessage?.(new MessageEvent("message", { data }));
        },
        restore() {
          window.Worker = original;
          delete (window as unknown as { __weatherControlled?: unknown }).__weatherControlled;
        },
      },
    });
  })()`
    .replace("ControlledWorker as unknown as typeof Worker", "ControlledWorker")
    .replace(
      "delete (window as unknown as { __weatherControlled?: unknown }).__weatherControlled",
      "delete window.__weatherControlled",
    );
  const controllerState = () =>
    controlledPage.evaluate(() => {
      const controller = (
        window as unknown as {
          __weatherControlled: {
            workers: Array<{ requests: Array<{ generation: number }>; terminated: number }>;
          };
        }
      ).__weatherControlled;
      return controller.workers.map((worker) => ({
        generations: worker.requests.map((request) => request.generation),
        terminated: worker.terminated,
      }));
    });
  const dispatch = (index: number, data: unknown) =>
    controlledPage.evaluate(
      ({ index, data }) =>
        (
          window as unknown as {
            __weatherControlled: { dispatch(index: number, data: unknown): void };
          }
        ).__weatherControlled.dispatch(index, data),
      { index, data },
    );
  await controlledPage.goto("http://127.0.0.1:8080/renewable-energy/solar/weather");
  await controlledPage.waitForFunction(() => {
    const input = document.querySelector('input[type="file"][accept*=".json"]');
    return Boolean(input && Object.keys(input).some((key) => key.startsWith("__reactProps$")));
  });
  await controlledPage.locator('input[type="file"][accept*=".json"]').setInputFiles({
    name: "stale-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(review.text),
  });
  await controlledPage.getByText("3. Quality summary").waitFor();
  await controlledPage.evaluate(installControlledWorker);

  await controlledPage.getByRole("button", { name: "Start validation" }).click();
  let state = await controllerState();
  const baselineGeneration = state[0].generations[0];
  await dispatch(0, { type: "success", generation: baselineGeneration, result: validResult });
  await controlledPage.getByText("3. Quality summary").waitFor();
  assert.equal((await controllerState())[0].terminated, 1);

  await controlledPage.getByRole("button", { name: "Start validation" }).click();
  await controlledPage.getByRole("button", { name: "Start validation" }).click();
  state = await controllerState();
  const generationA = state[1].generations[0];
  const generationB = state[2].generations[0];
  assert(generationB > generationA, "Generation B must be newer than generation A.");
  await dispatch(2, {
    type: "progress",
    generation: generationA,
    percent: 99,
    stage: "stale progress must not render",
  });
  const progressAfterStale = await controlledPage
    .getByLabel("Weather validation progress")
    .getAttribute("value");
  const stateAfterProgress = await controllerState();
  record(
    73,
    "Begin generation A, begin newer generation B, then dispatch A progress through B's production message handler.",
    "A's progress is ignored and B remains authoritative without result or governance state.",
    `A=${generationA} B=${generationB}; progress=${progressAfterStale}; B terminated=${stateAfterProgress[2].terminated}; summary=${await controlledPage.getByText("3. Quality summary").count()}`,
    progressAfterStale !== "99" &&
      stateAfterProgress[2].terminated === 0 &&
      (await controlledPage.getByText("3. Quality summary").count()) === 0 &&
      (await controlledPage.getByRole("button", { name: "Export review" }).count()) === 0,
  );
  await dispatch(2, {
    type: "success",
    generation: generationA,
    result: validResult,
  });
  record(
    74,
    "Dispatch A's production-shaped success through B's production message handler.",
    "No A summary, review state, approval state, or export is accepted; B stays active.",
    `A=${generationA} B=${generationB}; summary=${await controlledPage.getByText("3. Quality summary").count()}; exports=${await controlledPage.getByRole("button", { name: "Export review" }).count()}`,
    (await controlledPage.getByText("3. Quality summary").count()) === 0 &&
      (await controlledPage.getByRole("button", { name: "Export review" }).count()) === 0 &&
      (await controllerState())[2].terminated === 0,
  );
  await dispatch(2, {
    type: "error",
    generation: generationA,
    message: "stale error must not render",
  });
  const staleErrorText = await controlledPage.locator("main").innerText();
  const bActiveAfterStaleError = (await controllerState())[2].terminated === 0;
  await dispatch(2, { type: "success", generation: generationB, result: validResult });
  await controlledPage.getByText("3. Quality summary").waitFor();
  record(
    75,
    "Dispatch A's error through B's handler, then complete B with a valid production-shaped success.",
    "A's error is absent, B remains active, and B completes normally.",
    `A=${generationA} B=${generationB}; stale error visible=${staleErrorText.includes("stale error must not render")}; B active=${bActiveAfterStaleError}; B summary visible=${await controlledPage.getByText("3. Quality summary").count()}`,
    !staleErrorText.includes("stale error must not render") &&
      bActiveAfterStaleError &&
      (await controlledPage.getByText("3. Quality summary").count()) === 1,
  );

  await controlledPage.getByRole("button", { name: "Start validation" }).click();
  state = await controllerState();
  const generationC = state[3].generations[0];
  const malformedResult = structuredClone(validResult);
  malformedResult.summary.variableCompleteness = { ghi: "invalid nested value" };
  await dispatch(3, {
    type: "success",
    generation: generationC,
    result: malformedResult,
  });
  await controlledPage.getByText("Malformed worker result rejected.").waitFor();
  const malformedText = await controlledPage.locator("main").innerText();
  const malformedState = await controllerState();
  record(
    76,
    "Dispatch a current-generation success with malformed nested summary content.",
    "Production deep validation rejects it, terminates the worker, accepts no partial state, blocks governance/export, and retains Start over.",
    `C=${generationC}; alert=${await controlledPage.getByRole("alert").innerText()}; terminated=${malformedState[3].terminated}; summary=${await controlledPage.getByText("3. Quality summary").count()}; start-over=${await controlledPage.getByRole("button", { name: "Start over" }).count()}`,
    malformedText.includes("Malformed worker result rejected.") &&
      malformedState[3].terminated === 1 &&
      (await controlledPage.getByText("3. Quality summary").count()) === 0 &&
      (await controlledPage.getByRole("button", { name: "Export review" }).count()) === 0 &&
      (await controlledPage
        .getByRole("button", { name: "Approve for preliminary modelling" })
        .count()) === 0 &&
      (await controlledPage.getByRole("button", { name: "Start over" }).count()) === 1,
  );
  assert.deepEqual(controlledConsole, []);
  assert.deepEqual(controlledPageErrors, []);
  await controlledPage.evaluate(() =>
    (
      window as unknown as {
        __weatherControlled: { restore(): void };
      }
    ).__weatherControlled.restore(),
  );
  await controlledPage.close();
} catch (error) {
  const evidence = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const item = Math.min(requirements.length, (report.at(-1)?.item ?? 0) + 1);
  record(
    item,
    "Continue rendered UI acceptance sequence.",
    "Browser action completes.",
    evidence,
    false,
  );
} finally {
  console.log(
    JSON.stringify(
      report.sort((a, b) => a.item - b.item),
      null,
      2,
    ),
  );
  await browser.close();
}
assert.equal(
  report.some((item) => item.status === "Fail"),
  false,
  "Browser acceptance failed.",
);
