import type {
  WatermarkPosition,
  WatermarkSettings,
  WatermarkType,
} from "./WatermarkService";

type Props = {
  settings: WatermarkSettings;
  onChange: (
    settings: WatermarkSettings
  ) => void;
};

export default function WatermarkOptions({
  settings,
  onChange,
}: Props) {
  const updateSettings = (
    changes: Partial<WatermarkSettings>
  ) => {
    onChange({
      ...settings,
      ...changes,
    });
  };

  return (
    <div className="mt-8 space-y-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div>
        <h2 className="mb-5 text-2xl font-bold text-white">
          Watermark Type
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {(["text", "image"] as WatermarkType[]).map(
            (type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  updateSettings({ type })
                }
                className={`rounded-2xl border p-5 font-semibold capitalize transition ${
                  settings.type === type
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {type} Watermark
              </button>
            )
          )}
        </div>
      </div>

      {settings.type === "text" ? (
        <div className="space-y-5">
          <div>
            <label className="mb-2 block font-semibold text-white">
              Watermark Text
            </label>

            <input
              type="text"
              value={settings.text}
              placeholder="Example: CONFIDENTIAL"
              onChange={(event) =>
                updateSettings({
                  text: event.target.value,
                })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block font-semibold text-white">
                Font Size
              </label>

              <input
                type="number"
                min={8}
                max={200}
                value={settings.fontSize}
                onChange={(event) =>
                  updateSettings({
                    fontSize: Math.max(
                      8,
                      Number(event.target.value)
                    ),
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white"
              />
            </div>

            <div>
              <label className="mb-2 block font-semibold text-white">
                Text Color
              </label>

              <input
                type="color"
                value={settings.color}
                onChange={(event) =>
                  updateSettings({
                    color: event.target.value,
                  })
                }
                className="h-12 w-full rounded-xl border border-slate-700 bg-slate-800 p-2"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="mb-2 block font-semibold text-white">
              Watermark Image
            </label>

            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) =>
                updateSettings({
                  imageFile:
                    event.target.files?.[0] ??
                    null,
                })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-300"
            />

            {settings.imageFile && (
              <p className="mt-2 text-sm text-green-400">
                Selected:{" "}
                {settings.imageFile.name}
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 flex justify-between font-semibold text-white">
              <span>Image Size</span>
              <span>
                {settings.imageScale}%
              </span>
            </label>

            <input
              type="range"
              min={5}
              max={90}
              value={settings.imageScale}
              onChange={(event) =>
                updateSettings({
                  imageScale: Number(
                    event.target.value
                  ),
                })
              }
              className="w-full"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-2 flex justify-between font-semibold text-white">
          <span>Opacity</span>

          <span>
            {Math.round(
              settings.opacity * 100
            )}
            %
          </span>
        </label>

        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={settings.opacity}
          onChange={(event) =>
            updateSettings({
              opacity: Number(
                event.target.value
              ),
            })
          }
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-2 flex justify-between font-semibold text-white">
          <span>Rotation</span>
          <span>
            {settings.rotation}°
          </span>
        </label>

        <input
          type="range"
          min={-180}
          max={180}
          step={5}
          value={settings.rotation}
          onChange={(event) =>
            updateSettings({
              rotation: Number(
                event.target.value
              ),
            })
          }
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-2 block font-semibold text-white">
          Position
        </label>

        <select
          value={settings.position}
          onChange={(event) =>
            updateSettings({
              position:
                event.target
                  .value as WatermarkPosition,
            })
          }
          className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white"
        >
          <option value="top-left">
            Top Left
          </option>

          <option value="top-center">
            Top Center
          </option>

          <option value="top-right">
            Top Right
          </option>

          <option value="center-left">
            Center Left
          </option>

          <option value="center">
            Center
          </option>

          <option value="center-right">
            Center Right
          </option>

          <option value="bottom-left">
            Bottom Left
          </option>

          <option value="bottom-center">
            Bottom Center
          </option>

          <option value="bottom-right">
            Bottom Right
          </option>
        </select>
      </div>
    </div>
  );
}