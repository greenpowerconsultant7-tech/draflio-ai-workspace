import type { CompressionLevel } from "./CompressService";

type Props = {
  level: CompressionLevel;
  onChange: (level: CompressionLevel) => void;
};

export default function CompressOptions({
  level,
  onChange,
}: Props) {
  return (
    <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">

      <h2 className="mb-6 text-2xl font-bold text-white">
        Compression Level
      </h2>

      <div className="space-y-4">

        <label className="flex items-center gap-3 text-white">
          <input
            type="radio"
            checked={level === "low"}
            onChange={() => onChange("low")}
          />

          Low Compression
        </label>

        <label className="flex items-center gap-3 text-white">
          <input
            type="radio"
            checked={level === "recommended"}
            onChange={() =>
              onChange("recommended")
            }
          />

          Recommended ⭐
        </label>

        <label className="flex items-center gap-3 text-white">
          <input
            type="radio"
            checked={level === "maximum"}
            onChange={() =>
              onChange("maximum")
            }
          />

          Maximum Compression
        </label>

      </div>

    </div>
  );
}
