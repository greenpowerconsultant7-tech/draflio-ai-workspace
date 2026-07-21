import {
  Braces,
  FileCode2,
  FileText,
  LayoutTemplate,
  Settings2,
} from "lucide-react";

import type {
  HtmlPdfFormData,
  HtmlPdfOrientation,
  HtmlPdfPageFormat,
} from "./HtmlPdfService";

type Props = {
  data: HtmlPdfFormData;

  onChange: (
    data: HtmlPdfFormData
  ) => void;

  disabled?: boolean;
};

export default function HtmlPdfForm({
  data,
  onChange,
  disabled = false,
}: Props) {
  const updateField = <
    Key extends keyof HtmlPdfFormData,
  >(
    key: Key,
    value: HtmlPdfFormData[Key]
  ) => {
    onChange({
      ...data,
      [key]: value,
    });
  };

  const updateMargin = (
    side:
      | "top"
      | "right"
      | "bottom"
      | "left",
    value: string
  ) => {
    onChange({
      ...data,

      margin: {
        ...data.margin,
        [side]: value,
      },
    });
  };

  const loadSample = () => {
    onChange({
      ...data,

      filename:
        "draflio-html-document",

      html: `
<main class="document">
  <header class="hero">
    <p class="eyebrow">DRAFLIO DOCUMENT</p>
    <h1>HTML to PDF</h1>
    <p class="subtitle">
      Generate professional PDFs with real,
      selectable and searchable text.
    </p>
  </header>

  <section class="content">
    <h2>Document Overview</h2>

    <p>
      This PDF was generated from raw HTML and CSS
      using Draflio.
    </p>

    <div class="feature-grid">
      <article class="card">
        <h3>Selectable Text</h3>
        <p>
          Copy, search and highlight text normally.
        </p>
      </article>

      <article class="card">
        <h3>Print CSS</h3>
        <p>
          Control spacing, colors, tables and page breaks.
        </p>
      </article>
    </div>

    <h2>Example Table</h2>

    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>Quantity</th>
          <th>Price</th>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td>Document Conversion</td>
          <td>2</td>
          <td>$100.00</td>
        </tr>

        <tr>
          <td>PDF Processing</td>
          <td>1</td>
          <td>$50.00</td>
        </tr>
      </tbody>
    </table>
  </section>
</main>
      `.trim(),

      css: `
.document {
  max-width: 900px;
  margin: 0 auto;
  color: #0f172a;
}

.hero {
  padding: 40px;
  border-radius: 18px;
  color: white;
  background:
    linear-gradient(
      135deg,
      #2563eb,
      #7c3aed
    );
}

.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

h1 {
  margin: 0;
  font-size: 42px;
}

.subtitle {
  max-width: 620px;
  margin-top: 16px;
  font-size: 18px;
  line-height: 1.6;
}

.content {
  padding-top: 32px;
}

h2 {
  margin-top: 28px;
  color: #1d4ed8;
}

.feature-grid {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.card {
  padding: 20px;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: #f8fafc;
}

.card h3 {
  margin-top: 0;
}

table {
  width: 100%;
  margin-top: 18px;
}

th,
td {
  padding: 12px;
  border: 1px solid #cbd5e1;
  text-align: left;
}

th {
  color: white;
  background: #2563eb;
}

tr:nth-child(even) {
  background: #f1f5f9;
}
      `.trim(),
    });
  };

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileCode2 className="h-7 w-7 text-blue-400" />

            <div>
              <h2 className="text-2xl font-bold text-white">
                Document Content
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Enter the HTML and CSS that should
                appear in the PDF.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadSample}
            disabled={disabled}
            className="rounded-xl border border-blue-500/40 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-950/50 disabled:opacity-50"
          >
            Load Example
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block font-semibold text-white">
              PDF Filename
            </label>

            <input
              type="text"
              value={data.filename}
              disabled={disabled}
              placeholder="document"
              onChange={(event) =>
                updateField(
                  "filename",
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            />

            <p className="mt-2 text-sm text-slate-400">
              The .pdf extension is added automatically.
            </p>
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 font-semibold text-white">
              <Braces className="h-4 w-4" />
              HTML
            </label>

            <textarea
              value={data.html}
              disabled={disabled}
              rows={18}
              spellCheck={false}
              placeholder="<h1>Hello Draflio</h1>"
              onChange={(event) =>
                updateField(
                  "html",
                  event.target.value
                )
              }
              className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 font-semibold text-white">
              <FileText className="h-4 w-4" />
              CSS
            </label>

            <textarea
              value={data.css}
              disabled={disabled}
              rows={14}
              spellCheck={false}
              placeholder="h1 { color: #2563eb; }"
              onChange={(event) =>
                updateField(
                  "css",
                  event.target.value
                )
              }
              className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50"
            />

            <p className="mt-2 text-sm text-slate-400">
              Use classes such as{" "}
              <code>.page-break-before</code>,{" "}
              <code>.page-break-after</code> and{" "}
              <code>.avoid-page-break</code>.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="mb-6 flex items-center gap-3">
          <LayoutTemplate className="h-7 w-7 text-blue-400" />

          <div>
            <h2 className="text-2xl font-bold text-white">
              Page Layout
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Choose the PDF page size, orientation
              and margins.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block font-semibold text-white">
              Page Format
            </label>

            <select
              value={data.format}
              disabled={disabled}
              onChange={(event) =>
                updateField(
                  "format",
                  event.target
                    .value as HtmlPdfPageFormat
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="A4">
                A4
              </option>

              <option value="Letter">
                Letter
              </option>

              <option value="Legal">
                Legal
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 block font-semibold text-white">
              Orientation
            </label>

            <select
              value={data.orientation}
              disabled={disabled}
              onChange={(event) =>
                updateField(
                  "orientation",
                  event.target
                    .value as HtmlPdfOrientation
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="portrait">
                Portrait
              </option>

              <option value="landscape">
                Landscape
              </option>
            </select>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-4 font-bold text-white">
            Page Margins
          </h3>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                "top",
                "right",
                "bottom",
                "left",
              ] as const
            ).map((side) => (
              <div key={side}>
                <label className="mb-2 block capitalize text-sm font-semibold text-white">
                  {side}
                </label>

                <input
                  type="text"
                  value={data.margin[side]}
                  disabled={disabled}
                  placeholder="20mm"
                  onChange={(event) =>
                    updateMargin(
                      side,
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <label className="mb-2 flex justify-between font-semibold text-white">
            <span>PDF Scale</span>

            <span>
              {data.scale.toFixed(1)}×
            </span>
          </label>

          <input
            type="range"
            min={0.1}
            max={2}
            step={0.1}
            value={data.scale}
            disabled={disabled}
            onChange={(event) =>
              updateField(
                "scale",
                Number(event.target.value)
              )
            }
            className="w-full"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="mb-6 flex items-center gap-3">
          <Settings2 className="h-7 w-7 text-blue-400" />

          <div>
            <h2 className="text-2xl font-bold text-white">
              PDF Options
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Configure backgrounds, CSS page sizes,
              headers and footers.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <label className="flex items-center gap-3 text-white">
            <input
              type="checkbox"
              checked={data.printBackground}
              disabled={disabled}
              onChange={(event) =>
                updateField(
                  "printBackground",
                  event.target.checked
                )
              }
            />

            Print background colors and images
          </label>

          <label className="flex items-center gap-3 text-white">
            <input
              type="checkbox"
              checked={data.preferCssPageSize}
              disabled={disabled}
              onChange={(event) =>
                updateField(
                  "preferCssPageSize",
                  event.target.checked
                )
              }
            />

            Prefer CSS @page size
          </label>

          <label className="flex items-center gap-3 text-white">
            <input
              type="checkbox"
              checked={data.displayHeaderFooter}
              disabled={disabled}
              onChange={(event) =>
                updateField(
                  "displayHeaderFooter",
                  event.target.checked
                )
              }
            />

            Display header and footer
          </label>

          {data.displayHeaderFooter && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <label className="mb-2 block font-semibold text-white">
                  Header HTML
                </label>

                <textarea
                  value={data.headerHtml}
                  disabled={disabled}
                  rows={5}
                  spellCheck={false}
                  placeholder="<div>Draflio Document</div>"
                  onChange={(event) =>
                    updateField(
                      "headerHtml",
                      event.target.value
                    )
                  }
                  className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-2 block font-semibold text-white">
                  Footer HTML
                </label>

                <textarea
                  value={data.footerHtml}
                  disabled={disabled}
                  rows={5}
                  spellCheck={false}
                  placeholder='<div>Page <span class="pageNumber"></span></div>'
                  onChange={(event) =>
                    updateField(
                      "footerHtml",
                      event.target.value
                    )
                  }
                  className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
            </div>
          )}

          <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 text-sm text-blue-200">
            Header and footer templates can use{" "}
            <code>pageNumber</code>,{" "}
            <code>totalPages</code>,{" "}
            <code>date</code>,{" "}
            <code>title</code> and{" "}
            <code>url</code> classes.
          </div>
        </div>
      </section>
    </div>
  );
}