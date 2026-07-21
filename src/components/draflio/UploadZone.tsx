import { useState, useRef } from "react";
import { UploadCloud, FileText, Sparkles } from "lucide-react";

type UploadZoneProps = {
  variant?: "hero" | "workspace";
  multiple?: boolean;
  accept?: string;
  maxSizeMB?: number;
  onFiles?: (files: File[]) => void;
};

export function UploadZone({
  variant = "hero",
  multiple = false,
  accept = ".pdf",
  maxSizeMB = 500,
  onFiles,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);

  const validateFiles = (files: File[]) => {
    const validFiles: File[] = [];

    for (const file of files) {
      const size = file.size / (1024 * 1024);

      if (size <= maxSizeMB) {
        validFiles.push(file);
      }
    }

    return validFiles;
  };

  const processFiles = (fileList: FileList | null) => {
    if (!fileList) return;

    const files = Array.from(fileList);

    const validFiles = validateFiles(files);

    if (validFiles.length === 0) return;

    onFiles?.(validFiles);
  };
    return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        processFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={[
        "group relative cursor-pointer overflow-hidden rounded-3xl transition-all duration-300",
        variant === "hero" ? "p-10 sm:p-14" : "p-8",
        dragging
          ? "scale-[1.01] shadow-glow"
          : "shadow-card hover:shadow-glow",
        "glass-strong",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => processFiles(e.target.files)}
      />

      <div className="relative flex flex-col items-center text-center">

        <div className="relative">

          <div className="absolute inset-0 -z-10 animate-pulse-glow rounded-full bg-primary/40 blur-2xl" />

          <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-brand shadow-glow">
            <UploadCloud
              className="h-9 w-9 text-white"
              strokeWidth={2}
            />
          </div>

        </div>

        <h3 className="mt-6 text-2xl font-semibold tracking-tight">
          {multiple
            ? "Drop your PDF files here"
            : "Drop your PDF here"}
        </h3>

        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Upload up to {maxSizeMB} MB
        </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">

          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" />
            AI Ready
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-glow">
            <FileText className="h-3.5 w-3.5" />
            {multiple ? "Multiple Files" : "Single File"}
          </span>

        </div>

        <button
          type="button"
          className="mt-6 inline-flex items-center gap-2 rounded-xl gradient-brand px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition group-hover:scale-[1.02]"
        >
          Choose {multiple ? "Files" : "File"}
        </button>

        <p className="mt-3 text-xs text-muted-foreground">
          {multiple
            ? "You can select multiple PDFs"
            : "Select one PDF"}
        </p>

      </div>
          </div>
  );
}