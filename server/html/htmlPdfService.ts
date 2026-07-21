import {
  chromium,
  type Browser,
  type BrowserContext,
} from "playwright";

import type {
  ValidatedHtmlPdfRequest,
} from "./htmlPdfTypes";

let browserPromise:
  | Promise<Browser>
  | null = null;

const DEFAULT_TIMEOUT =
  60_000;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise =
      chromium
        .launch({
          headless: true,
        })
        .catch((error) => {
          /*
            Allow a future request to retry
            if Chromium failed to start.
          */
          browserPromise = null;

          throw error;
        });
  }

  return browserPromise;
}

function createBaseStyles() {
  return `
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
    }

    body {
      color: #111827;
      background: #ffffff;
      font-family:
        Arial,
        Helvetica,
        sans-serif;

      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    img,
    svg,
    canvas {
      max-width: 100%;
    }

    img {
      height: auto;
    }

    table {
      border-collapse: collapse;
    }

    .page-break-before {
      break-before: page;
      page-break-before: always;
    }

    .page-break-after {
      break-after: page;
      page-break-after: always;
    }

    .avoid-page-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    @media print {
      body {
        background: #ffffff;
      }
    }
  `;
}

function injectStylesIntoDocument(
  html: string,
  css: string
) {
  const styleTag = `
    <style>
      ${createBaseStyles()}
      ${css}
    </style>
  `;

  const containsHtmlElement =
    /<html[\s>]/i.test(html);

  if (!containsHtmlElement) {
    return `
      <!doctype html>

      <html lang="en">
        <head>
          <meta charset="utf-8" />

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          />

          ${styleTag}
        </head>

        <body>
          ${html}
        </body>
      </html>
    `;
  }

  /*
    The supplied content is already a full
    HTML document. Insert styles into its
    existing head.
  */
  if (/<\/head>/i.test(html)) {
    return html.replace(
      /<\/head>/i,
      `${styleTag}</head>`
    );
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1>
        <head>
          <meta charset="utf-8" />
          ${styleTag}
        </head>`
    );
  }

  return html;
}

function createHeaderFooterTemplate(
  html: string | undefined
) {
  if (!html) {
    return `
      <div
        style="
          width: 100%;
          height: 1px;
          font-size: 1px;
        "
      ></div>
    `;
  }

  return `
    <div
      style="
        width: 100%;
        padding: 0 15mm;
        box-sizing: border-box;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9px;
        color: #64748b;
      "
    >
      ${html}
    </div>
  `;
}

function isAllowedResource(
  requestUrl: string
) {
  try {
    const parsedUrl =
      new URL(requestUrl);

    /*
      External network requests are blocked.

      Images and fonts should be embedded
      using data URLs. This prevents HTML
      requests from accessing local network
      or private server resources.
    */
    return (
      parsedUrl.protocol ===
        "data:" ||
      parsedUrl.protocol ===
        "blob:" ||
      parsedUrl.protocol ===
        "about:"
    );
  } catch {
    return false;
  }
}

async function createSecureContext(
  browser: Browser
): Promise<BrowserContext> {
  const context =
    await browser.newContext({
      javaScriptEnabled: false,
      acceptDownloads: false,
    });

  await context.route(
    "**/*",
    async (route) => {
      const requestUrl =
        route.request().url();

      if (
        isAllowedResource(
          requestUrl
        )
      ) {
        await route.continue();
        return;
      }

      await route.abort(
        "blockedbyclient"
      );
    }
  );

  return context;
}

class HtmlPdfService {
  async generate(
    request:
      ValidatedHtmlPdfRequest
  ): Promise<Buffer> {
    let context:
      | BrowserContext
      | null = null;

    try {
      const browser =
        await getBrowser();

      context =
        await createSecureContext(
          browser
        );

      const page =
        await context.newPage();

      page.setDefaultTimeout(
        DEFAULT_TIMEOUT
      );

      page.setDefaultNavigationTimeout(
        DEFAULT_TIMEOUT
      );

      const completeHtml =
        injectStylesIntoDocument(
          request.html,
          request.css
        );

      await page.setContent(
        completeHtml,
        {
          waitUntil:
            "load",

          timeout:
            DEFAULT_TIMEOUT,
        }
      );

      /*
        Wait for browser fonts and document
        layout to finish before creating PDF.
      */
      await page.evaluate(
        async () => {
          if (
            "fonts" in document
          ) {
            await document.fonts.ready;
          }
        }
      );

      const {
        format,
        orientation,
        margin,
        printBackground,
        headerHtml,
        footerHtml,
        displayHeaderFooter,
        preferCssPageSize,
        scale,
      } = request.options;

      const pdfBytes =
        await page.pdf({
          format,

          landscape:
            orientation ===
            "landscape",

          margin: {
            top:
              margin.top,

            right:
              margin.right,

            bottom:
              margin.bottom,

            left:
              margin.left,
          },

          printBackground,

          displayHeaderFooter,

          headerTemplate:
            createHeaderFooterTemplate(
              headerHtml
            ),

          footerTemplate:
            createHeaderFooterTemplate(
              footerHtml
            ),

          preferCSSPageSize:
            preferCssPageSize,

          scale,

          tagged: true,

          outline: true,
          
        });

      return Buffer.from(
        pdfBytes
      );
    } catch (error) {
      console.error(
        "HTML to PDF rendering failed:",
        error
      );

      if (
        error instanceof Error &&
        error.message.includes(
          "Executable doesn't exist"
        )
      ) {
        throw new Error(
          "Chromium is not installed. Run: npx playwright install chromium"
        );
      }

      throw new Error(
        error instanceof Error
          ? error.message
          : "HTML could not be converted to PDF."
      );
    } finally {
      if (context) {
        await context.close();
      }
    }
  }

  async close() {
    if (!browserPromise) {
      return;
    }

    try {
      const browser =
        await browserPromise;

      await browser.close();
    } finally {
      browserPromise = null;
    }
  }
}

export const htmlPdfService =
  new HtmlPdfService();

export async function generateHtmlPdf(
  request:
    ValidatedHtmlPdfRequest
) {
  return htmlPdfService.generate(
    request
  );
}

export async function closeHtmlPdfBrowser() {
  await htmlPdfService.close();
}