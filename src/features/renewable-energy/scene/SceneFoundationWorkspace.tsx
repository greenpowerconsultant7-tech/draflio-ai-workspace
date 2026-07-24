import { useEffect, useReducer, useRef } from "react";
import {
  SCENE_LIMITS,
  type DraflioScene,
  type SceneValidationResult,
} from "../../../../shared/renewableEnergy/draflioSceneTypes";
import {
  createEmptyDraflioScene,
  normalizeDraflioScene,
  parseDraflioSceneJson,
  safeSceneFilename,
  serializeDraflioScene,
} from "../../../../shared/renewableEnergy/draflioSceneSerialization";
import { getDraflioSceneStatistics } from "../../../../shared/renewableEnergy/draflioSceneStatistics";
import { Breadcrumbs, RenewablePage, StatusBadge } from "../RenewableShell";
import { paginate, validateSceneJsonFile } from "./sceneJsonClient";

type State = {
  scene: DraflioScene | null;
  validation: SceneValidationResult | null;
  pastedJson: string;
  sceneName: string;
  error: string | null;
  page: number;
};
type Action =
  | { type: "name"; value: string }
  | { type: "paste"; value: string }
  | { type: "loaded"; scene: DraflioScene; validation: SceneValidationResult }
  | { type: "invalid"; validation?: SceneValidationResult; error: string }
  | { type: "page"; value: number }
  | { type: "reset" };
const initialState: State = {
  scene: null,
  validation: null,
  pastedJson: "",
  sceneName: "",
  error: null,
  page: 0,
};
function reducer(state: State, action: Action): State {
  if (action.type === "name") return { ...state, sceneName: action.value };
  if (action.type === "paste") return { ...state, pastedJson: action.value };
  if (action.type === "loaded")
    return { ...state, scene: action.scene, validation: action.validation, error: null, page: 0 };
  if (action.type === "invalid")
    return {
      ...state,
      scene: null,
      validation: action.validation ?? null,
      error: action.error,
      page: 0,
    };
  if (action.type === "page") return { ...state, page: action.value };
  return initialState;
}

const buttonClass =
  "rounded-xl border border-glass-border bg-card px-4 py-2 text-sm font-semibold transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function SceneFoundationWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const fileRef = useRef<HTMLInputElement>(null);
  const importGeneration = useRef(0);
  const downloadUrl = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      importGeneration.current++;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );
  const loadText = (text: string) => {
    const parsed = parseDraflioSceneJson(text);
    if (parsed.ok) dispatch({ type: "loaded", scene: parsed.scene, validation: parsed.validation });
    else
      dispatch({
        type: "invalid",
        validation: parsed.validation,
        error: parseErrorMessage(parsed.code),
      });
  };
  const createScene = () => {
    const scene = createEmptyDraflioScene(state.sceneName);
    const parsed = parseDraflioSceneJson(serializeDraflioScene(scene));
    if (parsed.ok) dispatch({ type: "loaded", scene: parsed.scene, validation: parsed.validation });
  };
  const importFile = async (file: File | undefined) => {
    const generation = ++importGeneration.current;
    if (!file) return;
    const check = validateSceneJsonFile(file);
    if (!check.valid) return dispatch({ type: "invalid", error: check.message });
    try {
      const text = await file.text();
      if (mounted.current && generation === importGeneration.current) loadText(text);
    } catch {
      if (mounted.current && generation === importGeneration.current)
        dispatch({ type: "invalid", error: "The selected JSON file could not be read." });
    }
  };
  const startOver = () => {
    importGeneration.current++;
    if (downloadUrl.current) {
      URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = null;
    }
    if (fileRef.current) fileRef.current.value = "";
    dispatch({ type: "reset" });
  };
  const download = () => {
    if (!state.scene || !state.validation?.valid || downloadUrl.current) return;
    const normalized = normalizeDraflioScene(state.scene);
    const url = URL.createObjectURL(
      new Blob([serializeDraflioScene(normalized)], { type: "application/json;charset=utf-8" }),
    );
    downloadUrl.current = url;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeSceneFilename(normalized.name);
    anchor.click();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        URL.revokeObjectURL(url);
        if (downloadUrl.current === url) downloadUrl.current = null;
      }),
    );
  };
  const statistics = state.scene ? getDraflioSceneStatistics(state.scene) : null;
  const objects = paginate(state.scene?.objects ?? [], state.page);

  return (
    <RenewablePage>
      <section className="border-b border-glass-border py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Renewable Energy", to: "/renewable-energy" },
              { label: "Solar PV", to: "/renewable-energy/solar" },
              { label: "Drawing-to-Scene" },
            ]}
          />
          <div className="mt-7">
            <StatusBadge>Foundation active</StatusBadge>
          </div>
          <h1 className="mt-5 text-4xl font-bold gradient-text sm:text-5xl">Drawing-to-Scene</h1>
          <h2 className="mt-5 text-2xl font-semibold">Scene Model Foundation</h2>
          <p className="mt-3 max-w-4xl leading-7 text-muted-foreground">
            The DraflioScene model and validation tools are active. Automatic PDF-to-3D extraction
            and 3D rendering are not active yet.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            JSON stays in this browser tab and is not uploaded or persisted.
          </p>
        </div>
      </section>
      <section className="py-12">
        <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <fieldset className="rounded-2xl border border-glass-border bg-card/50 p-5">
              <legend className="px-1 text-lg font-semibold">Create empty scene</legend>
              <label htmlFor="scene-name" className="mt-3 block text-sm font-medium">
                Optional scene name
              </label>
              <input
                id="scene-name"
                value={state.sceneName}
                maxLength={SCENE_LIMITS.maxSceneNameLength}
                onChange={(event) => dispatch({ type: "name", value: event.target.value })}
                className="mt-2 w-full rounded-lg border border-glass-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="button" onClick={createScene} className={`${buttonClass} mt-4`}>
                Create empty scene
              </button>
            </fieldset>
            <fieldset className="rounded-2xl border border-glass-border bg-card/50 p-5">
              <legend className="px-1 text-lg font-semibold">Import scene JSON</legend>
              <label htmlFor="scene-file" className="mt-3 block text-sm font-medium">
                DraflioScene JSON file
              </label>
              <input
                ref={fileRef}
                id="scene-file"
                type="file"
                accept=".json,application/json"
                onChange={(event) => void importFile(event.target.files?.[0])}
                className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                One JSON file, maximum 10 MB. Files are read locally.
              </p>
            </fieldset>
            <fieldset className="rounded-2xl border border-glass-border bg-card/50 p-5">
              <legend className="px-1 text-lg font-semibold">Paste JSON</legend>
              <label htmlFor="scene-json" className="mt-3 block text-sm font-medium">
                DraflioScene JSON
              </label>
              <textarea
                id="scene-json"
                rows={4}
                maxLength={SCENE_LIMITS.maxJsonBytes}
                value={state.pastedJson}
                onChange={(event) => dispatch({ type: "paste", value: event.target.value })}
                className="mt-2 w-full resize-y rounded-lg border border-glass-border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                disabled={!state.pastedJson}
                onClick={() => loadText(state.pastedJson)}
                className={`${buttonClass} mt-3`}
              >
                Validate pasted JSON
              </button>
            </fieldset>
          </div>
          <div
            aria-live="polite"
            className={`rounded-2xl border p-5 ${state.validation?.valid ? "border-primary/30 bg-primary/10" : "border-glass-border bg-card/50"}`}
          >
            <h2 className="text-xl font-semibold">Validation</h2>
            {state.validation ? (
              <p className="mt-2 text-sm">
                {state.validation.valid ? "Valid DraflioScene" : "Invalid DraflioScene"} ·{" "}
                {state.validation.errors.length} errors · {state.validation.warnings.length}{" "}
                warnings
              </p>
            ) : state.error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {state.error}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Create or import a scene to validate it.
              </p>
            )}
            {state.error && state.validation && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            {state.validation &&
              [...state.validation.errors, ...state.validation.warnings].length > 0 && (
                <ul className="mt-4 max-h-72 space-y-2 overflow-auto">
                  {[...state.validation.errors, ...state.validation.warnings].map((item, index) => (
                    <li
                      key={`${item.code}-${item.path}-${index}`}
                      className="rounded-lg bg-background/50 p-3 text-sm"
                    >
                      <span className="font-semibold">{item.code}</span>{" "}
                      <code className="ml-2 text-xs text-muted-foreground">{item.path}</code>
                      <p className="mt-1 text-muted-foreground">{item.message}</p>
                    </li>
                  ))}
                </ul>
              )}
          </div>
          {state.scene && statistics && (
            <>
              <section aria-labelledby="summary-title">
                <h2 id="summary-title" className="text-2xl font-semibold">
                  Scene summary
                </h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Schema version", state.scene.schemaVersion],
                    ["Scene name", state.scene.name],
                    ["Scene ID", state.scene.sceneId],
                    ["Coordinate system", state.scene.coordinateSystem.type],
                    ["Objects", statistics.objectCount],
                    ["Sources", statistics.sourceDocumentCount],
                    ["Revisions", statistics.revisionCount],
                    ["Review status", state.scene.reviewSummary.status],
                    ["Vertices", statistics.totalVertexCount],
                    ["Triangles", statistics.totalTriangleCount],
                    ["Needs review", statistics.needsReviewCount],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="min-w-0 rounded-xl border border-glass-border bg-card/40 p-4"
                    >
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <SceneTables
                scene={state.scene}
                page={objects.page}
                pageCount={objects.pageCount}
                objects={objects.items}
                setPage={(value) => dispatch({ type: "page", value })}
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!state.validation?.valid}
                  onClick={download}
                  className={buttonClass}
                >
                  Download normalized JSON
                </button>
                <button type="button" onClick={startOver} className={buttonClass}>
                  Start over
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </RenewablePage>
  );
}

function SceneTables({
  scene,
  objects,
  page,
  pageCount,
  setPage,
}: {
  scene: DraflioScene;
  objects: DraflioScene["objects"];
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="overflow-x-auto rounded-2xl border border-glass-border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="p-4 text-left text-lg font-semibold">Scene objects</caption>
          <thead className="bg-secondary/50">
            <tr>
              {[
                "Object name",
                "Type",
                "Geometry",
                "Extraction method",
                "Review status",
                "Sources",
              ].map((heading) => (
                <th key={heading} scope="col" className="px-4 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {objects.map((object) => (
              <tr key={object.id} className="border-t border-glass-border">
                <td className="px-4 py-3">{object.name}</td>
                <td className="px-4 py-3">{object.kind}</td>
                <td className="px-4 py-3">{object.geometry.type}</td>
                <td className="px-4 py-3">
                  {[
                    ...new Set(
                      object.sourceReferences.map((reference) => reference.extractionMethod),
                    ),
                  ].join(", ") || "None"}
                </td>
                <td className="px-4 py-3">{object.reviewStatus}</td>
                <td className="px-4 py-3">{object.sourceReferences.length}</td>
              </tr>
            ))}
            {objects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No scene objects
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous object page"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          className={buttonClass}
        >
          Previous
        </button>
        <span className="text-sm text-muted-foreground">
          Page {page + 1} of {pageCount}
        </span>
        <button
          type="button"
          aria-label="Next object page"
          disabled={page + 1 >= pageCount}
          onClick={() => setPage(page + 1)}
          className={buttonClass}
        >
          Next
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-2xl border border-glass-border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="p-4 text-left text-lg font-semibold">Source documents</caption>
            <thead className="bg-secondary/50">
              <tr>
                {["Display name", "Media type", "Pages", "Hash", "Imported"].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scene.sourceDocuments.map((source) => (
                <tr key={source.id} className="border-t border-glass-border">
                  <td className="px-4 py-3">{source.displayName}</td>
                  <td className="px-4 py-3">{source.mediaType}</td>
                  <td className="px-4 py-3">{source.pageCount ?? "—"}</td>
                  <td className="px-4 py-3">{source.sha256 ? "Available" : "Not provided"}</td>
                  <td className="px-4 py-3">{new Date(source.importedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {scene.sourceDocuments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No source documents
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-glass-border">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="p-4 text-left text-lg font-semibold">Revisions</caption>
            <thead className="bg-secondary/50">
              <tr>
                {["Revision", "Label", "Created", "Sources", "Summary"].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scene.revisions.map((revision) => (
                <tr key={revision.id} className="border-t border-glass-border">
                  <td className="px-4 py-3">{revision.revisionNumber}</td>
                  <td className="px-4 py-3">{revision.label}</td>
                  <td className="px-4 py-3">{new Date(revision.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{revision.sourceDocumentIds.length}</td>
                  <td className="px-4 py-3">{revision.summary ?? "—"}</td>
                </tr>
              ))}
              {scene.revisions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No revisions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function parseErrorMessage(code: string) {
  const messages: Record<string, string> = {
    EMPTY_JSON: "JSON input is empty.",
    JSON_SIZE_LIMIT_EXCEEDED: "JSON input exceeds the 10 MB limit.",
    MALFORMED_JSON: "JSON syntax is malformed.",
    INVALID_SCENE: "JSON does not satisfy the DraflioScene schema.",
  };
  return messages[code] ?? "Scene JSON could not be validated.";
}
