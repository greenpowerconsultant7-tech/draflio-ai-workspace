import type { SplitMode } from "./SplitService";

type Props = {
  mode: SplitMode;
  onChange: (mode: SplitMode) => void;
};

export default function SplitOptions({
  mode,
  onChange,
}: Props) {
  return (
    <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">

      <h2 className="mb-6 text-2xl font-bold text-white">
        Split Options
      </h2>

      <div className="space-y-6">

        <label className="flex items-center gap-3 text-white">
          <input
            type="radio"
            checked={mode.type === "every-page"}
            onChange={() =>
              onChange({
                type: "every-page",
              })
            }
          />

          Split Every Page
        </label>

        <label className="flex items-center gap-3 text-white">
          <input
            type="radio"
            checked={mode.type === "extract"}
            onChange={() =>
              onChange({
                type: "extract",
                pages: [],
              })
            }
          />

          Extract Pages
        </label>

        {mode.type === "extract" && (
          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white"
            placeholder="Example: 1,3,5"
            onChange={(e) => {
              const pages = e.target.value
                .split(",")
                .map((p) => Number(p.trim()))
                .filter((p) => !Number.isNaN(p));

              onChange({
                type: "extract",
                pages,
              });
            }}
          />
        )}

        <label className="flex items-center gap-3 text-white">
          <input
            type="radio"
            checked={mode.type === "every-n"}
            onChange={() =>
              onChange({
                type: "every-n",
                size: 2,
              })
            }
          />

          Split Every N Pages
        </label>

        {mode.type === "every-n" && (
          <input
            type="number"
            min={1}
            defaultValue={2}
            className="w-32 rounded-xl border border-slate-700 bg-slate-800 p-3 text-white"
            onChange={(e) =>
              onChange({
                type: "every-n",
                size: Number(e.target.value),
              })
            }
          />
        )}

        <label className="flex items-center gap-3 text-white">
          <input
            type="radio"
            checked={mode.type === "range"}
            onChange={() =>
              onChange({
                type: "range",
                ranges: [],
              })
            }
          />

          Split by Range
        </label>

        {mode.type === "range" && (
          <textarea
            className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white"
            rows={3}
            placeholder="Example:
1-5
6-10"
            onChange={(e) => {
              const ranges = e.target.value
                .split("\n")
                .map((r) => r.trim())
                .filter(Boolean);

              onChange({
                type: "range",
                ranges,
              });
            }}
          />
        )}

      </div>
    </div>
  );
}