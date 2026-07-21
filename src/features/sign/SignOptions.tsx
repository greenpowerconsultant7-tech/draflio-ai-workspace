import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import {
  Eraser,
  PenLine,
  Type,
  Upload,
} from "lucide-react";

import type {
  SignatureMode,
  SignaturePosition,
  SignatureSettings,
} from "./SignService";

type Props = {
  settings: SignatureSettings;

  onChange: (
    settings: SignatureSettings
  ) => void;
};

type SignaturePadProps = {
  value: string | null;

  onChange: (
    value: string | null
  ) => void;
};

function SignaturePad({
  value,
  onChange,
}: SignaturePadProps) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const [drawing, setDrawing] =
    useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.width = 700;
    canvas.height = 220;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";

    if (value) {
      const image = new Image();

      image.onload = () => {
        context.drawImage(
          image,
          0,
          0,
          canvas.width,
          canvas.height
        );
      };

      image.src = value;
    }
  }, []);

  const getCoordinates = (
    event: PointerEvent<HTMLCanvasElement>
  ) => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return {
        x: 0,
        y: 0,
      };
    }

    const rectangle =
      canvas.getBoundingClientRect();

    return {
      x:
        (event.clientX -
          rectangle.left) *
        (canvas.width /
          rectangle.width),

      y:
        (event.clientY -
          rectangle.top) *
        (canvas.height /
          rectangle.height),
    };
  };

  const handlePointerDown = (
    event: PointerEvent<HTMLCanvasElement>
  ) => {
    const canvas =
      canvasRef.current;

    const context =
      canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    canvas.setPointerCapture(
      event.pointerId
    );

    const coordinates =
      getCoordinates(event);

    context.beginPath();

    context.moveTo(
      coordinates.x,
      coordinates.y
    );

    setDrawing(true);
  };

  const handlePointerMove = (
    event: PointerEvent<HTMLCanvasElement>
  ) => {
    if (!drawing) {
      return;
    }

    const canvas =
      canvasRef.current;

    const context =
      canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const coordinates =
      getCoordinates(event);

    context.lineTo(
      coordinates.x,
      coordinates.y
    );

    context.stroke();
  };

  const finishDrawing = () => {
    const canvas =
      canvasRef.current;

    if (!canvas || !drawing) {
      return;
    }

    setDrawing(false);

    onChange(
      canvas.toDataURL("image/png")
    );
  };

  const clearSignature = () => {
    const canvas =
      canvasRef.current;

    const context =
      canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={
          handlePointerDown
        }
        onPointerMove={
          handlePointerMove
        }
        onPointerUp={
          finishDrawing
        }
        onPointerCancel={
          finishDrawing
        }
        onPointerLeave={
          finishDrawing
        }
        className="h-44 w-full touch-none rounded-xl border border-slate-600 bg-white"
      />

      <button
        type="button"
        onClick={clearSignature}
        className="mt-3 flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        <Eraser className="h-4 w-4" />
        Clear Signature
      </button>
    </div>
  );
}

export default function SignOptions({
  settings,
  onChange,
}: Props) {
  const updateSettings = (
    changes: Partial<SignatureSettings>
  ) => {
    onChange({
      ...settings,
      ...changes,
    });
  };

  const signatureModes: {
    mode: SignatureMode;
    label: string;
    icon: typeof Type;
  }[] = [
    {
      mode: "type",
      label: "Type",
      icon: Type,
    },
    {
      mode: "draw",
      label: "Draw",
      icon: PenLine,
    },
    {
      mode: "upload",
      label: "Upload",
      icon: Upload,
    },
  ];

  return (
    <div className="mt-8 space-y-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div>
        <h2 className="mb-5 text-2xl font-bold text-white">
          Create Signature
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {signatureModes.map(
            ({
              mode,
              label,
              icon: Icon,
            }) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  updateSettings({
                    mode,
                  })
                }
                className={`flex items-center justify-center gap-2 rounded-2xl border p-4 font-semibold transition ${
                  settings.mode === mode
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            )
          )}
        </div>
      </div>

      {settings.mode === "type" && (
        <div className="space-y-5">
          <div>
            <label className="mb-2 block font-semibold text-white">
              Signature Name
            </label>

            <input
              type="text"
              value={
                settings.typedText
              }
              placeholder="Type your name"
              onChange={(event) =>
                updateSettings({
                  typedText:
                    event.target.value,
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
                min={12}
                max={120}
                value={
                  settings.fontSize
                }
                onChange={(event) =>
                  updateSettings({
                    fontSize: Math.max(
                      12,
                      Number(
                        event.target
                          .value
                      )
                    ),
                  })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white"
              />
            </div>

            <div>
              <label className="mb-2 block font-semibold text-white">
                Signature Color
              </label>

              <input
                type="color"
                value={settings.color}
                onChange={(event) =>
                  updateSettings({
                    color:
                      event.target
                        .value,
                  })
                }
                className="h-12 w-full rounded-xl border border-slate-700 bg-slate-800 p-2"
              />
            </div>
          </div>
        </div>
      )}

      {settings.mode === "draw" && (
        <div>
          <label className="mb-3 block font-semibold text-white">
            Draw Your Signature
          </label>

          <SignaturePad
            value={
              settings.drawnDataUrl
            }
            onChange={(value) =>
              updateSettings({
                drawnDataUrl: value,
              })
            }
          />
        </div>
      )}

      {settings.mode ===
        "upload" && (
        <div>
          <label className="mb-2 block font-semibold text-white">
            Upload Signature Image
          </label>

          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) =>
              updateSettings({
                uploadedImage:
                  event.target.files?.[0] ??
                  null,
              })
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-300"
          />

          {settings.uploadedImage && (
            <p className="mt-2 text-sm text-green-400">
              Selected:{" "}
              {
                settings
                  .uploadedImage.name
              }
            </p>
          )}
        </div>
      )}

      {settings.mode !== "type" && (
        <div>
          <label className="mb-2 flex justify-between font-semibold text-white">
            <span>Signature Size</span>

            <span>
              {settings.widthPercent}%
            </span>
          </label>

          <input
            type="range"
            min={10}
            max={70}
            value={
              settings.widthPercent
            }
            onChange={(event) =>
              updateSettings({
                widthPercent: Number(
                  event.target.value
                ),
              })
            }
            className="w-full"
          />
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
          min={0.2}
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
        <label className="mb-2 block font-semibold text-white">
          Position
        </label>

        <select
          value={settings.position}
          onChange={(event) =>
            updateSettings({
              position:
                event.target
                  .value as SignaturePosition,
            })
          }
          className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white"
        >
          <option value="top-left">
            Top Left
          </option>

          <option value="top-right">
            Top Right
          </option>

          <option value="center">
            Center
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

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          Apply Signature To
        </h3>

        <div className="space-y-4">
          <label className="flex items-center gap-3 text-white">
            <input
              type="radio"
              name="signature-scope"
              checked={
                settings.scope.type ===
                "first"
              }
              onChange={() =>
                updateSettings({
                  scope: {
                    type: "first",
                  },
                })
              }
            />

            First page
          </label>

          <label className="flex items-center gap-3 text-white">
            <input
              type="radio"
              name="signature-scope"
              checked={
                settings.scope.type ===
                "all"
              }
              onChange={() =>
                updateSettings({
                  scope: {
                    type: "all",
                  },
                })
              }
            />

            All pages
          </label>

          <label className="flex items-center gap-3 text-white">
            <input
              type="radio"
              name="signature-scope"
              checked={
                settings.scope.type ===
                "selected"
              }
              onChange={() =>
                updateSettings({
                  scope: {
                    type: "selected",
                    pages: [],
                  },
                })
              }
            />

            Selected pages
          </label>

          {settings.scope.type ===
            "selected" && (
            <input
              type="text"
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

                updateSettings({
                  scope: {
                    type: "selected",
                    pages,
                  },
                });
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}