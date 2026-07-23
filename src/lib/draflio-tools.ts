import {
  FileText, Merge, Split, Minimize2, RotateCw, Lock, Unlock,
  FileType, FileSpreadsheet, Presentation, Image as ImageIcon,
  Droplets, PenLine, ScanText, Languages, MessagesSquare,
  Search, Sparkles, Table, FileSearch, Wand2, ShieldX, Hash,
  type LucideIcon,
} from "lucide-react";

export type DraflioTool = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: "AI" | "Organize" | "Convert" | "Optimize" | "Secure" | "Edit";
  gradient: string;
  featured?: boolean;
};

export const DRAFLIO_TOOLS: DraflioTool[] = [
  { id: "ai-chat",       name: "Chat with PDF",       description: "Ask any question about your document.", icon: MessagesSquare, category: "AI", gradient: "from-primary to-accent", featured: true },
  { id: "ai-search",     name: "AI Search",           description: "Natural language search across pages.", icon: Search,        category: "AI", gradient: "from-accent to-primary", featured: true },
  { id: "smart-ocr",     name: "Smart OCR",           description: "Scanned to editable, with formatting.", icon: ScanText,      category: "AI", gradient: "from-primary to-chart-3", featured: true },
  { id: "summarize",     name: "Summarize PDF",       description: "Create a page-referenced extractive summary of a searchable PDF.", icon: Sparkles, category: "AI", gradient: "from-accent to-chart-4" },
  { id: "extract",       name: "Smart Extraction",    description: "Dates, GST, PAN, emails, tables.",       icon: FileSearch,    category: "AI", gradient: "from-primary to-accent" },
  { id: "translate",     name: "Translate",           description: "Translate documents into 40+ langs.",    icon: Languages,     category: "AI", gradient: "from-accent to-primary" },
  { id: "extract-table", name: "Extract Tables",      description: "Pull tables into Excel & CSV.",          icon: Table,         category: "AI", gradient: "from-chart-3 to-primary" },

  { id: "merge-pdf",         name: "Merge PDF",           description: "Combine PDFs in your preferred order.",  icon: Merge,         category: "Organize", gradient: "from-primary to-primary-glow" },
  { id: "split",         name: "Split PDF",           description: "Extract pages or ranges into new PDFs.", icon: Split,         category: "Organize", gradient: "from-primary to-primary-glow" },
  { id: "rotate",        name: "Rotate PDF",          description: "Rotate all or selected pages.",          icon: RotateCw,      category: "Organize", gradient: "from-primary to-primary-glow" },

  { id: "compress",      name: "Compress PDF",        description: "Reduce file size with smart quality.",   icon: Minimize2,     category: "Optimize", gradient: "from-chart-4 to-primary" },
  { id: "watermark",     name: "Watermark",           description: "Add text or image watermarks.",           icon: Droplets,      category: "Edit",     gradient: "from-accent to-primary" },
  { id: "add-page-numbers", name: "Add Page Numbers", description: "Add customizable page numbers to a PDF while preserving the original document quality.", icon: Hash, category: "Edit", gradient: "from-cyan-500 to-primary" },
  { id: "sign",          name: "Sign PDF",            description: "Draw, type, or upload signatures.",       icon: PenLine,       category: "Edit",     gradient: "from-accent to-accent-glow" },
  { id: "redact",        name: "Redact PDF",          description: "Permanently mask selected PDF areas.",     icon: ShieldX,       category: "Secure",   gradient: "from-red-500 to-primary" },

  { id: "protect",       name: "Protect PDF",         description: "Password-protect and encrypt PDFs.",     icon: Lock,          category: "Secure",   gradient: "from-primary to-accent" },
  { id: "unlock",        name: "Unlock PDF",          description: "Remove password protection.",            icon: Unlock,        category: "Secure",   gradient: "from-accent to-primary" },

  { id: "word",          name: "Word ↔ PDF",          description: "Convert DOCX to PDF and back.",           icon: FileType,      category: "Convert",  gradient: "from-primary to-chart-3" },
  { id: "excel",         name: "Excel ↔ PDF",         description: "Convert spreadsheets to PDF and back.",   icon: FileSpreadsheet, category: "Convert", gradient: "from-chart-4 to-primary" },
  { id: "ppt",           name: "PowerPoint ↔ PDF",    description: "Convert slides to PDF and back.",         icon: Presentation,  category: "Convert",  gradient: "from-accent to-chart-4" },
  { id: "jpg",           name: "JPG ↔ PDF",           description: "Convert images to PDF and extract images.", icon: ImageIcon,   category: "Convert",  gradient: "from-primary to-accent" },
  { id: "invoice",       name: "Invoice to PDF",      description:    "Create professional invoices with automatic totals.",  icon: FileText,  category: "Edit",  gradient:    "from-primary to-accent",  featured: true,},
  { id: "html-to-pdf",   name: "HTML to PDF",         description:  "Convert HTML and CSS into professional PDFs.",  icon: FileText,  category: "Convert",  gradient:    "from-primary to-accent",  featured: true,},

] as const;

export const TOOL_BY_ID = Object.fromEntries(DRAFLIO_TOOLS.map((t) => [t.id, t]));

export const CATEGORY_ORDER: DraflioTool["category"][] = [
  "AI", "Organize", "Optimize", "Convert", "Edit", "Secure",
];

export function toolIcon(id: string) {
  return TOOL_BY_ID[id]?.icon ?? FileText;
}
