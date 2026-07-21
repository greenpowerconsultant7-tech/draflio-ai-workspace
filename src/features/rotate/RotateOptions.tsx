import type {
  RotationAngle,
  RotationScope,
} from "./RotateService";

type Props = {
  angle: RotationAngle;
  scope: RotationScope;
  onAngleChange: (
    angle: RotationAngle
  ) => void;
  onScopeChange: (
    scope: RotationScope
  ) => void;
};

export default function RotateOptions({
  angle,
  scope,
  onAngleChange,
  onScopeChange,
}: Props) {
  return (
    <div className="mt-8 space-y-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div>
        <h2 className="mb-5 text-2xl font-bold text-white">
          Rotation
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() =>
              onAngleChange(90)
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              angle === 90
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Rotate 90°
          </button>

          <button
            type="button"
            onClick={() =>
              onAngleChange(180)
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              angle === 180
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Rotate 180°
          </button>

          <button
            type="button"
            onClick={() =>
              onAngleChange(270)
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              angle === 270
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Rotate 270°
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-5 text-2xl font-bold text-white">
          Pages
        </h2>

        <div className="space-y-4">
          <label className="flex items-center gap-3 text-white">
            <input
              type="radio"
              name="rotation-scope"
              checked={
                scope.type === "all"
              }
              onChange={() =>
                onScopeChange({
                  type: "all",
                })
              }
            />

            Rotate all pages
          </label>

          <label className="flex items-center gap-3 text-white">
            <input
              type="radio"
              name="rotation-scope"
              checked={
                scope.type ===
                "selected"
              }
              onChange={() =>
                onScopeChange({
                  type: "selected",
                  pages: [],
                })
              }
            />

            Rotate selected pages
          </label>

          {scope.type ===
            "selected" && (
            <div>
              <input
                type="text"
                value={scope.pages.join(",")}
                placeholder="Example: 1,3,5"
                onChange={(event) => {
                  const pages =
                    event.target.value
                      .split(",")
                      .map((page) =>
                        Number(
                          page.trim()
                        )
                      )
                      .filter(
                        (page) =>
                          Number.isInteger(
                            page
                          ) && page > 0
                      );

                  onScopeChange({
                    type: "selected",
                    pages,
                  });
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500"
              />

              <p className="mt-2 text-sm text-slate-400">
                Enter page numbers
                separated by commas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}