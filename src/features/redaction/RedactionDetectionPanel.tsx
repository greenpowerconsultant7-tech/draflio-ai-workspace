import { useState } from "react";
import type {
  DetectionCategory,
  DetectionOptions,
  DetectionProgress,
  RedactionSuggestion,
} from "./redactionDetection";

interface Props {
  suggestions: RedactionSuggestion[];
  scanning: boolean;
  progress: DetectionProgress | null;
  message: string;
  limitMessage: string;
  remainingCapacity: number;
  disabled: boolean;
  onScan: (options: DetectionOptions) => void;
  onCancel: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onAcceptSelected: () => void;
  onAcceptAll: () => void;
  onRejectSelected: () => void;
  onRejectAll: () => void;
}

const categoryLabels: Record<DetectionCategory, string> = {
  email: "Email",
  phone: "Phone",
  "payment-card": "Payment card",
  ipv4: "IPv4",
  date: "Date",
  custom: "Custom phrase",
};

export default function RedactionDetectionPanel({
  suggestions,
  scanning,
  progress,
  message,
  limitMessage,
  remainingCapacity,
  disabled,
  onScan,
  onCancel,
  onSelectAll,
  onClearSelection,
  onAcceptSelected,
  onAcceptAll,
  onRejectSelected,
  onRejectAll,
}: Props) {
  const [options, setOptions] = useState<DetectionOptions>({
    email: true,
    phone: true,
    paymentCard: true,
    ipv4: true,
    date: true,
    customPhrase: "",
  });
  const selectedCount = suggestions.filter((suggestion) => suggestion.selected).length;
  const counts = suggestions.reduce<Partial<Record<DetectionCategory, number>>>((result, item) => {
    result[item.category] = (result[item.category] ?? 0) + 1;
    return result;
  }, {});
  const setCategory = (key: keyof Omit<DetectionOptions, "customPhrase">, checked: boolean) =>
    setOptions((current) => ({ ...current, [key]: checked }));
  const canScan =
    !disabled &&
    !scanning &&
    (options.email ||
      options.phone ||
      options.paymentCard ||
      options.ipv4 ||
      options.date ||
      options.customPhrase.trim().length > 0);

  return (
    <section className="rounded-3xl border border-cyan-500/30 bg-cyan-950/15 p-5">
      <h2 className="text-lg font-bold text-white">Automatic suggestions</h2>
      <p className="mt-2 text-xs text-slate-400">
        Searchable text is scanned locally in this browser. Detected values are not displayed or
        sent to the server.
      </p>

      <fieldset className="mt-4 grid grid-cols-2 gap-2" disabled={disabled || scanning}>
        <legend className="sr-only">Detection categories</legend>
        {(
          [
            ["email", "Email"],
            ["phone", "Phone"],
            ["paymentCard", "Payment card"],
            ["ipv4", "IPv4"],
            ["date", "Date"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(event) => setCategory(key, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className="mt-4 block text-sm text-slate-200">
        Custom phrase
        <input
          type="text"
          value={options.customPhrase}
          disabled={disabled || scanning}
          onChange={(event) =>
            setOptions((current) => ({ ...current, customPhrase: event.target.value }))
          }
          placeholder="Literal phrase"
          className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500 disabled:opacity-50"
        />
      </label>

      {scanning ? (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-xl border border-cyan-400 px-4 py-2 font-semibold text-cyan-100"
        >
          Cancel scan
        </button>
      ) : (
        <button
          type="button"
          disabled={!canScan}
          onClick={() => onScan(options)}
          className="mt-4 w-full rounded-xl bg-cyan-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          Scan document
        </button>
      )}

      <div className="mt-4 text-sm text-slate-300" aria-live="polite">
        {scanning && progress
          ? `Scanning page ${progress.currentPage} of ${progress.totalPages}`
          : message}
      </div>

      {suggestions.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold text-white">
            {suggestions.length} suggestions · {selectedCount} selected
          </p>
          <ul
            className="mt-2 space-y-1 text-xs text-slate-300"
            aria-label="Suggestion counts by category"
          >
            {(Object.keys(categoryLabels) as DetectionCategory[]).map((category) =>
              counts[category] ? (
                <li key={category}>
                  {categoryLabels[category]}: {counts[category]}
                </li>
              ) : null,
            )}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onSelectAll}
              className="rounded-lg border border-slate-600 px-2 py-2 text-xs text-white disabled:opacity-40"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={disabled || selectedCount === 0}
              onClick={onClearSelection}
              className="rounded-lg border border-slate-600 px-2 py-2 text-xs text-white disabled:opacity-40"
            >
              Clear selection
            </button>
            <button
              type="button"
              disabled={disabled || selectedCount === 0 || remainingCapacity === 0}
              onClick={onAcceptSelected}
              className="rounded-lg bg-cyan-700 px-2 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Accept selected
            </button>
            <button
              type="button"
              disabled={disabled || remainingCapacity === 0}
              onClick={onAcceptAll}
              className="rounded-lg bg-cyan-700 px-2 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Accept all
            </button>
            <button
              type="button"
              disabled={disabled || selectedCount === 0}
              onClick={onRejectSelected}
              className="rounded-lg border border-slate-600 px-2 py-2 text-xs text-white disabled:opacity-40"
            >
              Reject selected
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onRejectAll}
              className="rounded-lg border border-slate-600 px-2 py-2 text-xs text-white disabled:opacity-40"
            >
              Reject all
            </button>
          </div>
        </>
      )}

      {limitMessage && (
        <p className="mt-3 text-xs text-amber-200" role="status">
          {limitMessage}
        </p>
      )}
    </section>
  );
}
