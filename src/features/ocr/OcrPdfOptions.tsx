import { useState } from "react";
import { FileType2, Languages, ScanText } from "lucide-react";
import {
  isOcrLanguageCode,
  searchOcrLanguages,
} from "../../../shared/ocrLanguages";
import type { OcrPdfOptions as OcrOptions } from "./OcrPdfService";

type Props = {
  options: OcrOptions;
  onOptionsChange: (options: OcrOptions) => void;
  locked?: boolean;
};

export default function OcrPdfOptions({
  options,
  onOptionsChange,
  locked = false,
}: Props) {
  const [languageSearch, setLanguageSearch] = useState("");
  const filteredLanguages = searchOcrLanguages(languageSearch);
  const updateOptions = (changes: Partial<OcrOptions>) =>
    onOptionsChange({ ...options, ...changes });

  return (
    <div className="mt-8 space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div className="flex items-center gap-3">
        <ScanText className="h-7 w-7 text-cyan-400" />
        <h2 className="text-2xl font-bold text-white">OCR Settings</h2>
      </div>

      <div>
        <label
          htmlFor="ocr-language-search"
          className="mb-2 flex items-center gap-2 font-semibold text-white"
        >
          <Languages className="h-5 w-5 text-cyan-400" />
          Language already used in the document
        </label>
        <input
          id="ocr-language-search"
          type="search"
          value={languageSearch}
          disabled={locked}
          onChange={(event) => setLanguageSearch(event.target.value)}
          placeholder="Search by language, region, or locale code"
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus-visible:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-60"
        />
        <select
          aria-label="Language already used in the document"
          value={options.language}
          disabled={locked}
          onChange={(event) => {
            const language = event.target.value;
            if (isOcrLanguageCode(language)) {
              updateOptions({ language });
            }
          }}
          className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus-visible:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-60"
        >
          {filteredLanguages.length === 0 ? (
            <option value={options.language} disabled>
              No supported languages match
            </option>
          ) : (
            filteredLanguages.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label} ({entry.code})
              </option>
            ))
          )}
        </select>
        <p className="mt-2 text-sm text-slate-400">
          Choose the main language currently visible in the scanned PDF. This improves OCR text
          recognition and does not translate the document.
        </p>
        <p className="mt-2 text-sm text-amber-300">
          For documents containing multiple languages, choose the primary language. Recognition
          accuracy may vary for other languages.
        </p>
        <p className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-950/30 p-3 text-sm text-cyan-200">
          OCR recognizes existing text. It does not translate text into another language.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5">
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="checkbox"
            checked={options.createWordDocument}
            disabled={locked}
            onChange={(event) => updateOptions({ createWordDocument: event.target.checked })}
            className="mt-1 h-5 w-5 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 disabled:opacity-60"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold text-white">
              <FileType2 className="h-5 w-5 text-cyan-400" />
              Also create an editable Word document
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              After OCR finishes, Draflio will convert the searchable PDF into a Microsoft Word
              document containing editable text.
            </p>
            <p className="mt-2 text-xs text-amber-300">
              This requires an additional conversion and may take longer.
            </p>
          </div>
        </label>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/30 p-4 text-sm text-cyan-200">
        OCR adds a selectable and searchable text layer to scanned PDF pages.
      </div>
    </div>
  );
}
