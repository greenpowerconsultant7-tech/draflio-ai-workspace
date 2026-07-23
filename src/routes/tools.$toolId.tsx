import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Header } from "@/components/draflio/Header";
import { ToolLayout } from "@/components/draflio/ToolLayout";
import { TOOL_BY_ID } from "@/lib/draflio-tools";
import MergeController from "@/features/merge/MergeController";
import SplitWorkspace from "@/features/split/SplitWorkspace";
import CompressWorkspace from "@/features/compress/CompressWorkspace";
import RotateWorkspace from "@/features/rotate/RotateWorkspace";
import WatermarkWorkspace from "@/features/watermark/WatermarkWorkspace";
import ProtectWorkspace from "@/features/protect/ProtectWorkspace";
import UnlockWorkspace from "@/features/unlock/UnlockWorkspace";
import SignWorkspace from "@/features/sign/SignWorkspace";
import JpgPdfWorkspace from "@/features/jpg/JpgPdfWorkspace";
import WordPdfWorkspace from "@/features/word/WordPdfWorkspace";
import ExcelPdfWorkspace from "@/features/excel/ExcelPdfWorkspace";
import PowerPointPdfWorkspace from "@/features/ppt/PowerPointPdfWorkspace";
import OcrPdfWorkspace from "@/features/ocr/OcrPdfWorkspace";
import InvoiceWorkspace from "@/features/invoice/InvoiceWorkspace";
import HtmlPdfWorkspace from "@/features/html/HtmlPdfWorkspace";
import RedactionWorkspace from "@/features/redaction/RedactionWorkspace";
import PageNumberWorkspace from "@/features/pageNumbers/PageNumberWorkspace";

export const Route = createFileRoute("/tools/$toolId")({
  loader: ({ params }) => {
    const tool = TOOL_BY_ID[params.toolId];
    if (!tool) throw notFound();
    return { toolId: tool.id };
  },
  head: ({ loaderData }) => {
    const tool = loaderData?.toolId ? TOOL_BY_ID[loaderData.toolId] : undefined;
    return {
      meta: [
        {
          title:
            tool?.id === "add-page-numbers"
              ? "Add Page Numbers to PDF | Draflio"
              : tool
                ? `${tool.name} · Draflio`
                : "Tool · Draflio",
        },
        {
          name: "description",
          content:
            tool?.id === "add-page-numbers"
              ? "Add customizable page numbers to selected PDF pages while preserving the original document quality."
              : tool?.description ?? "AI document tool.",
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">Tool not found</h1>
        <Link to="/tools" className="mt-6 inline-block text-primary-glow underline">
          Back to all tools
        </Link>
      </div>
    </div>
  ),
  component: ToolPage,
});

function ToolPage() {
  const { toolId } =
    Route.useLoaderData();
  const tool = TOOL_BY_ID[toolId];

  if (!tool) throw notFound();

if (tool.id === "merge-pdf") {
    return (
      <MergeController
        tool={tool}
      />
    );
}

if (tool.id === "split") {
    return <SplitWorkspace />;
}

if (tool.id === "compress") {
    return <CompressWorkspace />;
}

if (tool.id === "rotate") {
    return <RotateWorkspace />;
}

if (tool.id === "watermark") {
  return <WatermarkWorkspace />;
}
  
if (tool.id === "protect") {
  return <ProtectWorkspace />;
}

if (tool.id === "unlock") {
  return <UnlockWorkspace />;
}

if (tool.id === "sign") {
  return <SignWorkspace />;
}

if (tool.id === "jpg") {
  return <JpgPdfWorkspace />;
}

if (tool.id === "word") {
  return <WordPdfWorkspace />;
}

if (tool.id === "excel") {
  return <ExcelPdfWorkspace />;
}

if (tool.id === "ppt") {
  return <PowerPointPdfWorkspace />;
}

if (tool.id === "smart-ocr") {
  return <OcrPdfWorkspace />;
}

if (tool.id === "invoice") {
  return <InvoiceWorkspace />;
}

if (tool.id === "html-to-pdf") {
  return <HtmlPdfWorkspace />;
}

if (tool.id === "redact") {
  return <RedactionWorkspace />;
}

if (tool.id === "add-page-numbers") {
  return <PageNumberWorkspace />;
}

  return (
    <ToolLayout tool={tool} />
  );
}
