import assert from "node:assert/strict";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function reportFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pixel = await pdf.embedPng(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
    const page = pdf.addPage([612, 792]);
    const lines = [
      "Controlled Operations Report",
      `Section ${pageIndex + 1}: Inspection and Maintenance`,
      "The inspection team must submit the signed maintenance report before Friday.",
      "The bearing measurements show stable operation during the controlled test.",
      "The maintenance supervisor should review the documented inspection sequence.",
      "Recommendation: provide the final inspection record to the operations team.",
      "The report describes project risks, maintenance controls, and approval steps.",
      "Controlled footer",
    ];
    lines.forEach((line, index) =>
      page.drawText(line, {
        x: 48,
        y: 735 - index * 38,
        size: 11,
        font,
        color: rgb(0.1, 0.1, 0.1),
      }),
    );
    page.drawRectangle({ x: 42, y: 420, width: 520, height: 1, color: rgb(0.2, 0.4, 0.6) });
    if (pageIndex === 1) page.drawImage(pixel, { x: 48, y: 380, width: 40, height: 40 });
  }
  return Buffer.from(await pdf.save());
}

async function imageOnlyFixture() {
  const pdf = await PDFDocument.create();
  const pixel = await pdf.embedPng(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const page = pdf.addPage([612, 792]);
  page.drawImage(pixel, { x: 40, y: 40, width: 532, height: 712 });
  return Buffer.from(await pdf.save());
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const externalRequests: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("request", (request) => {
  const url = new URL(request.url());
  if (
    !["localhost", "127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(
      url.hostname,
    ) &&
    url.protocol !== "data:"
  ) {
    externalRequests.push(url.origin);
  }
});
await page.addInitScript(() => {
  const created: string[] = [];
  const revoked: string[] = [];
  const originalCreate = URL.createObjectURL.bind(URL);
  const originalRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = originalCreate(blob);
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
    originalRevoke(url);
  };
  Object.defineProperty(window, "__summaryObjectUrls", {
    value: { created, revoked },
    configurable: false,
  });
});
await page.route("http://localhost:3001/**", async (route) => {
  await route.continue({ url: route.request().url().replace("localhost:3001", "127.0.0.1:3002") });
});

try {
  const response = await page.goto("http://localhost:8080/tools/summarize", {
    waitUntil: "networkidle",
  });
  assert.equal(response?.status(), 200);
  assert.equal(await page.title(), "Summarize PDF | Draflio");
  assert.match(
    await page.locator('meta[name="description"]').getAttribute("content") ?? "",
    /page-referenced extractive summary/i,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Summarize PDF" }).waitFor();
  assert.equal(await page.getByLabel("Choose PDF to summarize").count(), 1);
  assert.equal(await page.getByText("Deterministic extractive summary").count(), 1);

  const bytes = await reportFixture();
  const documentCreation = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      candidate.url().endsWith("/api/document-intelligence/sessions"),
  );
  await page.getByLabel("Choose PDF to summarize").setInputFiles({
    name: "controlled-report.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  const documentResponse = await documentCreation;
  assert.equal(documentResponse.status(), 202);
  assert.match(documentResponse.headers().location ?? "", /\/api\/document-intelligence\/sessions\//);
  const documentPayload = await documentResponse.json() as {
    session: { id: string };
  };
  await page.getByText(/Classification:/).waitFor({ timeout: 60_000 });
  await page.getByText(/Pages: 3/).waitFor();
  await page.getByText(/Image-only regions may not be included/).waitFor();
  const summaryCreation = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      candidate.url().includes("/summaries"),
  );
  await page.getByRole("button", { name: "Create summary" }).click();
  const summaryResponse = await summaryCreation;
  assert.equal(summaryResponse.status(), 202);
  assert.match(summaryResponse.headers().location ?? "", /\/api\/document-intelligence\/summaries\//);
  await page.getByText("Extractive summary", { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole("heading", { name: "Overview" }).waitFor();
  await page.getByRole("heading", { name: "Key points" }).waitFor();
  await page.getByRole("heading", { name: "Possible action items" }).waitFor();
  assert.ok((await page.getByText(/Page 1|Pages 1/).count()) > 0);
  assert.equal(await page.getByText(/AI-generated insight|guaranteed complete/i).count(), 0);

  const txtDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download TXT" }).click();
  const txt = await txtDownload;
  assert.equal(txt.suggestedFilename(), "controlled-report-summary.txt");
  const txtContent = await (await txt.createReadStream()).toArray();
  assert.match(Buffer.concat(txtContent).toString("utf8"), /Limitations/);

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const json = await jsonDownload;
  const jsonContent = Buffer.concat(await (await json.createReadStream()).toArray()).toString("utf8");
  const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
  assert.equal(parsed.generationMethod, "deterministic-extractive");
  assert.doesNotMatch(jsonContent, /pageText|chunks|pdfBytes|parserError/);

  const repeatedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  await repeatedDownload;
  await page.waitForTimeout(20);
  const objectUrls = await page.evaluate(() => {
    const value = (window as unknown as {
      __summaryObjectUrls: { created: string[]; revoked: string[] };
    }).__summaryObjectUrls;
    return { created: value.created.length, revoked: value.revoked.length };
  });
  assert.equal(objectUrls.created, 3);
  assert.equal(objectUrls.revoked, 3);

  for (const mode of ["detailed", "page-by-page"] as const) {
    const creation = await page.request.post(
      `http://127.0.0.1:3002/api/document-intelligence/sessions/${documentPayload.session.id}/summaries`,
      {
        data: {
          mode,
          includeKeyPoints: true,
          includePossibleActionItems: true,
          includePageSummaries: true,
        },
      },
    );
    assert.equal(creation.status(), 202);
    const payload = await creation.json() as { summary: { id: string; status: string } };
    let status = payload.summary.status;
    for (let attempt = 0; attempt < 100 && status !== "ready"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const poll = await page.request.get(
        `http://127.0.0.1:3002/api/document-intelligence/summaries/${payload.summary.id}`,
      );
      status = ((await poll.json()) as { summary: { status: string } }).summary.status;
    }
    assert.equal(status, "ready");
    const resultResponse = await page.request.get(
      `http://127.0.0.1:3002/api/document-intelligence/summaries/${payload.summary.id}/result`,
    );
    assert.equal(resultResponse.status(), 200);
    assert.match(resultResponse.headers()["cache-control"] ?? "", /no-store/);
    const result = await resultResponse.json() as {
      mode: string;
      pageSummaries: Array<{ pageNumber: number }>;
    };
    assert.equal(result.mode, mode);
    assert.equal(result.pageSummaries.length, 3);
  }

  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByLabel("Choose PDF to summarize").waitFor();
  await page.getByLabel("Choose PDF to summarize").setInputFiles({
    name: "second-report.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await page.getByText(/Classification:/).waitFor({ timeout: 60_000 });
  await page.getByLabel("Page by page").check();
  assert.equal(await page.getByLabel("Include page summaries").isChecked(), true);
  assert.equal(await page.getByLabel("Include page summaries").isDisabled(), true);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );

  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByLabel("Choose PDF to summarize").setInputFiles({
    name: "image-only.pdf",
    mimeType: "application/pdf",
    buffer: await imageOnlyFixture(),
  });
  await page.getByText(/Use Smart OCR first/).waitFor({ timeout: 60_000 });
  assert.equal(await page.getByRole("button", { name: "Create summary" }).count(), 0);
  await page.getByRole("link", { name: "Open Smart OCR" }).waitFor();
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(consoleErrors.filter((message) => !/favicon/i.test(message)).length, 0);
  console.log("Summary browser tests passed.");
} finally {
  await browser.close();
}
