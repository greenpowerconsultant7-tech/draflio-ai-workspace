import {
  PAGE_NUMBER_FONTS,
  PAGE_NUMBER_FORMATS,
  PAGE_NUMBER_POSITIONS,
  type PageNumberOptions as Options,
} from "./pageNumberTypes";

type Props = {
  options: Options;
  disabled: boolean;
  error: string;
  onChange: (options: Options) => void;
  onGenerate: () => void;
};

const labels = {
  numeric: "1, 2, 3",
  "zero-padded": "01, 02, 03",
  "page-prefix": "Page 1",
  "page-of-total": "Page 1 of N",
};

export function PageNumberOptions({ options, disabled, error, onChange, onGenerate }: Props) {
  const update = (changes: Partial<Options>) => onChange({ ...options, ...changes });
  return (
    <section className="space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-xl font-bold">Page-number settings</h2>
      <label className="block">
        <span className="mb-1 block font-medium">Number format</span>
        <select
          value={options.format}
          disabled={disabled}
          onChange={(event) => {
            const format = PAGE_NUMBER_FORMATS.find((value) => value === event.target.value);
            if (format) update({ format });
          }}
          className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3"
        >
          {PAGE_NUMBER_FORMATS.map((format) => (
            <option key={format} value={format}>
              {labels[format]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Starting number</span>
        <input
          type="number"
          min={-999999}
          max={999999}
          step={1}
          value={options.startingNumber}
          disabled={disabled}
          onChange={(event) => update({ startingNumber: Number(event.target.value) })}
          className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3"
        />
      </label>
      <fieldset disabled={disabled}>
        <legend className="font-medium">Pages to number</legend>
        <div className="mt-2 flex gap-5">
          {(["all", "custom"] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-2">
              <input
                type="radio"
                name="page-mode"
                checked={options.pageMode === mode}
                onChange={() => update({ pageMode: mode })}
              />
              {mode === "all" ? "All pages" : "Custom pages"}
            </label>
          ))}
        </div>
      </fieldset>
      {options.pageMode === "custom" && (
        <label className="block">
          <span className="mb-1 block font-medium">Custom page range</span>
          <input
            value={options.customRange}
            disabled={disabled}
            onChange={(event) => update({ customRange: event.target.value })}
            placeholder="1-3, 7, 10-12"
            aria-describedby="page-range-help"
            className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-800 p-3"
          />
          <span id="page-range-help" className="mt-1 block text-xs text-slate-400">
            Custom pages are resolved first, then skipped opening pages are excluded.
          </span>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block font-medium">Skip first N pages</span>
        <input
          type="number"
          min={0}
          step={1}
          value={options.skipFirst}
          disabled={disabled}
          onChange={(event) => update({ skipFirst: Number(event.target.value) })}
          className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3"
        />
      </label>
      <fieldset disabled={disabled}>
        <legend className="font-medium">Position</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAGE_NUMBER_POSITIONS.map((position) => (
            <label
              key={position}
              className="flex items-center gap-2 rounded-lg border border-slate-700 p-2 capitalize"
            >
              <input
                type="radio"
                name="position"
                checked={options.position === position}
                onChange={() => update({ position })}
              />
              {position.replace("-", " ")}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="mb-1 block font-medium">Font</span>
          <select
            value={options.font}
            disabled={disabled}
            onChange={(event) => {
              const font = PAGE_NUMBER_FONTS.find((value) => value === event.target.value);
              if (font) update({ font });
            }}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3"
          >
            {PAGE_NUMBER_FONTS.map((font) => (
              <option key={font}>{font}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end p-3">
          <input
            type="checkbox"
            checked={options.bold}
            disabled={disabled}
            onChange={(event) => update({ bold: event.target.checked })}
          />
          Bold
        </label>
        <label>
          <span className="mb-1 block font-medium">Font size (pt)</span>
          <input
            type="number"
            min={6}
            max={48}
            step={1}
            value={options.fontSize}
            disabled={disabled}
            onChange={(event) => update({ fontSize: Number(event.target.value) })}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3"
          />
        </label>
        <label>
          <span className="mb-1 block font-medium">Margin (pt)</span>
          <input
            type="number"
            min={6}
            max={144}
            step={1}
            value={options.margin}
            disabled={disabled}
            onChange={(event) => update({ margin: Number(event.target.value) })}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block font-medium">Text color</span>
        <input
          type="color"
          value={options.color}
          disabled={disabled}
          onChange={(event) => update({ color: event.target.value })}
          className="h-12 w-full rounded-lg border border-slate-600 bg-slate-800 p-1"
        />
      </label>
      <p className="text-sm text-slate-400">
        Numbers increase only on pages that receive a number. “Page X of N” uses the total number
        of numbered pages.
      </p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button
        type="button"
        disabled={disabled}
        onClick={onGenerate}
        className="w-full rounded-xl bg-cyan-600 p-3 font-bold text-white disabled:opacity-50"
      >
        Generate numbered PDF
      </button>
    </section>
  );
}
