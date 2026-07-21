import {
  FileType2,
  Languages,
  ScanText,
} from "lucide-react";

import type {
  OcrLanguage,
  OcrPdfOptions as OcrOptions,
} from "./OcrPdfService";

type Props = {
  options: OcrOptions;

  onOptionsChange: (
    options: OcrOptions
  ) => void;
};

export default function OcrPdfOptions({
  options,
  onOptionsChange,
}: Props) {
  const updateOptions = (
    changes: Partial<OcrOptions>
  ) => {
    onOptionsChange({
      ...options,
      ...changes,
    });
  };

  return (
    <div className="mt-8 space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div className="flex items-center gap-3">
        <ScanText className="h-7 w-7 text-cyan-400" />

        <h2 className="text-2xl font-bold text-white">
          OCR Settings
        </h2>
      </div>

      <div>
        <label className="mb-2 flex items-center gap-2 font-semibold text-white">
          <Languages className="h-5 w-5 text-cyan-400" />

          Document Language
        </label>

        <select
          value={
            options.language
          }
          onChange={(
            event
          ) =>
            updateOptions({
              language:
                event.target
                  .value as OcrLanguage,
            })
          }
          className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-cyan-500"
        >
          <option value="en-US">
            English — United States
          </option>

          <option value="en-GB">
            English — United Kingdom
          </option>

          <option value="fr-FR">
            French
          </option>

          <option value="de-DE">
            German
          </option>

          <option value="es-ES">
            Spanish
          </option>

          <option value="it-IT">
            Italian
          </option>

          <option value="pt-BR">
            Portuguese — Brazil
          </option>

          <option value="nl-NL">
            Dutch
          </option>
        </select>

        <p className="mt-2 text-sm text-slate-400">
          Select the main language used in
          the scanned document.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5">
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="checkbox"
            checked={
              options.createWordDocument
            }
            onChange={(
              event
            ) =>
              updateOptions({
                createWordDocument:
                  event.target.checked,
              })
            }
            className="mt-1 h-5 w-5 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold text-white">
              <FileType2 className="h-5 w-5 text-cyan-400" />

              Also create an editable Word document
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              After OCR finishes, Draflio
              will convert the searchable
              PDF into a Microsoft Word
              document containing editable
              text.
            </p>

            <p className="mt-2 text-xs text-amber-300">
              This requires an additional
              conversion and may take
              longer.
            </p>
          </div>
        </label>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/30 p-4 text-sm text-cyan-200">
        OCR adds a selectable and searchable
        text layer to scanned PDF pages.
      </div>
    </div>
  );
}