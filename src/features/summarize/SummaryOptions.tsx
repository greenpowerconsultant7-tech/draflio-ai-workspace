import type { SummaryMode, SummaryOptions as Options } from "./summaryTypes";

type Props = {
  value: Options;
  disabled: boolean;
  onChange: (value: Options) => void;
};

export default function SummaryOptions({ value, disabled, onChange }: Props) {
  const setMode = (mode: SummaryMode) =>
    onChange({
      ...value,
      mode,
      includePageSummaries: mode === "page-by-page" ? true : mode === "brief" ? false : value.includePageSummaries,
    });
  return (
    <fieldset disabled={disabled} className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-5">
      <legend className="px-2 text-lg font-semibold text-white">Summary options</legend>
      <div>
        <p className="mb-2 text-sm font-medium text-white">Summary style</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["brief", "detailed", "page-by-page"] as const).map((mode) => (
            <label key={mode} className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 p-3">
              <input
                type="radio"
                name="summary-mode"
                checked={value.mode === mode}
                onChange={() => setMode(mode)}
              />
              <span>{mode === "page-by-page" ? "Page by page" : `${mode[0].toUpperCase()}${mode.slice(1)}`}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={value.includeKeyPoints}
          onChange={(event) => onChange({ ...value, includeKeyPoints: event.target.checked })}
        />
        Include key points
      </label>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={value.includePossibleActionItems}
          onChange={(event) =>
            onChange({ ...value, includePossibleActionItems: event.target.checked })
          }
        />
        Include possible action items
      </label>
      {value.mode !== "brief" && (
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={value.includePageSummaries}
            disabled={disabled || value.mode === "page-by-page"}
            onChange={(event) =>
              onChange({ ...value, includePageSummaries: event.target.checked })
            }
          />
          Include page summaries
          {value.mode === "page-by-page" && <span className="text-xs text-slate-400">(required)</span>}
        </label>
      )}
      <p className="text-sm text-slate-300">
        This summary selects important sentences from searchable PDF text. It does not interpret
        images or rewrite the document with a generative AI model.
      </p>
    </fieldset>
  );
}
