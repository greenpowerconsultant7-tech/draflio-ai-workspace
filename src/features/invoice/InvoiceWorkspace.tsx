import {
  useState,
} from "react";

import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  ReceiptText,
  RotateCcw,
  XCircle,
} from "lucide-react";

import {
  useAbortableTask,
} from "@/hooks/useAbortableTask";

import {
  getApiErrorMessage,
} from "@/lib/apiError";

import {
  downloadPdf,
} from "@/lib/downloadFile";

import InvoiceForm from "./InvoiceForm";

import {
  invoicePdfService,
  type InvoiceFormData,
  type InvoicePdfResult,
} from "./InvoicePdfService";

function createId() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random()}`
  );
}

function formatDate(
  date: Date
) {
  return date
    .toISOString()
    .slice(0, 10);
}

function createDefaultInvoice():
  InvoiceFormData {
  const invoiceDate =
    new Date();

  const dueDate =
    new Date();

  dueDate.setDate(
    dueDate.getDate() + 14
  );

  return {
    invoiceNumber:
      `INV-${Date.now()
        .toString()
        .slice(-6)}`,

    invoiceDate:
      formatDate(invoiceDate),

    dueDate:
      formatDate(dueDate),

    currency:
      "USD",

    seller: {
      name: "",
      email: "",
      phone: "",
      taxId: "",
      address: "",
    },

    customer: {
      name: "",
      email: "",
      phone: "",
      taxId: "",
      address: "",
    },

    items: [
      {
        id: createId(),
        description: "",
        quantity: 1,
        unitPrice: 0,
      },
    ],

    taxRate: 0,
    discount: 0,

    notes:
      "Thank you for your business.",

    paymentTerms:
      "Payment due within 14 days.",
  };
}

function formatBytes(
  bytes: number
) {
  if (
    bytes < 1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(2)} MB`;
}

function isAbortError(
  error: unknown
) {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

export default function InvoiceWorkspace() {
  const [
    invoiceData,
    setInvoiceData,
  ] = useState<InvoiceFormData>(
    createDefaultInvoice
  );

  const [
    result,
    setResult,
  ] = useState<InvoicePdfResult | null>(
    null
  );

  const [
    error,
    setError,
  ] = useState("");

  const {
    run,
    cancel,
    isRunning: loading,
  } = useAbortableTask<InvoicePdfResult>();

  const handleFormChange = (
    nextData: InvoiceFormData
  ) => {
    setInvoiceData(nextData);
    setResult(null);
    setError("");
  };

  const handleGenerate =
    async () => {
      if (loading) {
        return;
      }

      try {
        setResult(null);
        setError("");

        const generatedResult =
          await run(
            (signal) =>
              invoicePdfService.generate(
                invoiceData,
                {
                  signal,
                }
              )
          );

        if (!generatedResult) {
          return;
        }

        setResult(
          generatedResult
        );
      } catch (generationError) {
        if (
          isAbortError(
            generationError
          )
        ) {
          return;
        }

        console.error(
          "Invoice generation failed:",
          generationError
        );

        setError(
          getApiErrorMessage(
            generationError,
            "The invoice PDF could not be generated."
          )
        );
      }
    };

  const handleCancel =
    () => {
      cancel();

      setError(
        "Invoice generation was cancelled."
      );
    };

  const handleDownload =
    () => {
      if (!result) {
        return;
      }

      downloadPdf(
        result.blob,
        result.filename
      );
    };

  const resetWorkspace =
    () => {
      cancel();

      setInvoiceData(
        createDefaultInvoice()
      );

      setResult(null);
      setError("");
    };

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <ReceiptText className="h-10 w-10 text-blue-500" />

          <h1 className="text-4xl font-bold">
            Invoice to PDF
          </h1>
        </div>

        <p className="max-w-3xl text-slate-400">
          Create a professional invoice with
          selectable text, automatic totals,
          tax calculations, discounts, and
          multi-page support.
        </p>
      </div>

      <div className="rounded-2xl border border-blue-500/20 bg-blue-950/30 p-5 text-blue-200">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-6 w-6 shrink-0" />

          <div>
            <p className="font-semibold">
              Professional PDF invoice
            </p>

            <p className="mt-1 text-sm text-blue-200/80">
              The generated PDF contains real,
              searchable and selectable text.
              It is not a screenshot.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-red-300">
          {error}
        </div>
      )}

      <InvoiceForm
        data={invoiceData}
        onChange={
          handleFormChange
        }
        disabled={loading}
      />

      <div className="mt-8">
        <button
          type="button"
          onClick={
            handleGenerate
          }
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />

              Generating Invoice...
            </>
          ) : (
            <>
              <ReceiptText className="h-5 w-5" />

              Generate Invoice PDF
            </>
          )}
        </button>

        {loading && (
          <>
            <button
              type="button"
              onClick={
                handleCancel
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/40 px-8 py-3 font-semibold text-red-300 transition hover:bg-red-950/40"
            >
              <XCircle className="h-5 w-5" />

              Cancel Generation
            </button>

            <p className="mt-3 text-center text-sm text-slate-400">
              Your invoice is being prepared.
            </p>
          </>
        )}
      </div>

      {result && (
        <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
          <div className="border-b border-green-500/20 p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 text-green-400" />

              <h2 className="text-3xl font-bold text-green-400">
                Invoice Created
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              Your professional invoice PDF
              is ready to download.
            </p>
          </div>

          <div className="grid gap-4 p-8 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Invoice Number
              </p>

              <p className="mt-2 break-all text-xl font-bold text-white">
                {
                  invoiceData.invoiceNumber
                }
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Customer
              </p>

              <p className="mt-2 break-words text-xl font-bold text-white">
                {
                  invoiceData.customer.name
                }
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                PDF Size
              </p>

              <p className="mt-2 text-xl font-bold text-white">
                {formatBytes(
                  result.size
                )}
              </p>
            </div>
          </div>

          <div className="mx-8 mb-8 rounded-2xl border border-blue-500/20 bg-blue-950/30 p-4 text-blue-200">
            The invoice PDF includes selectable
            text and can be searched, copied,
            printed, or attached to an email.
          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={
                handleDownload
              }
              className="flex items-center gap-2 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
            >
              <Download className="h-5 w-5" />

              Download Invoice PDF
            </button>

            <button
              type="button"
              onClick={
                resetWorkspace
              }
              className="flex items-center gap-2 rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              <RotateCcw className="h-5 w-5" />

              Create Another Invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}