import { createDefaultTransform } from "../draflioSceneGeometry";
import { createEmptyDraflioScene } from "../draflioSceneSerialization";
import type { Annotation, DraflioScene, SourceDocument } from "../draflioSceneTypes";
import { validateDraflioScene } from "../draflioSceneValidation";
import { normalizePaths } from "./drawingCore";
import type { Calibration, DrawingExtraction } from "./drawingTypes";

export function drawingToDraflioScene(input: {
  sourceName: string;
  importedAt: string;
  extraction: DrawingExtraction;
  calibration: Calibration;
}): DraflioScene {
  const paths = normalizePaths(input.extraction.paths, input.calibration);
  if (paths.length === 0) throw new Error("Accept at least one reviewed geometry object.");
  const scene = createEmptyDraflioScene(input.sourceName.replace(/\.pdf$/i, "") || "Drawing scene");
  const sourceId = "00000000-0000-4000-8000-000000000001";
  const source: SourceDocument = {
    id: sourceId,
    displayName: input.sourceName.replace(/[\\/]/g, "-").slice(0, 150),
    mediaType: "application/pdf",
    pageCount: input.extraction.pages.length,
    importedAt: input.importedAt,
  };
  const objects: Annotation[] = paths.map((path, index) => ({
    id: `00000000-0000-4000-8001-${String(index + 1).padStart(12, "0")}`,
    kind: "annotation",
    name: `${path.classification} from page ${path.pageNumber}`,
    visible: true,
    reviewStatus: "needs-review",
    geometry: {
      type: "polyline",
      points: path.points.map((point) => ({ x: point.x, y: point.y, z: 0 })),
      closed: path.closed,
    },
    transform: createDefaultTransform(),
    sourceReferences: [
      {
        sourceDocumentId: sourceId,
        pageNumber: path.pageNumber,
        extractionMethod: "vector",
        sourceBounds: { ...path.sourceBounds },
        note: "Manual scale calibration; planar review geometry only.",
      },
    ],
    warnings: [
      {
        code: "ENGINEERING_REVIEW_REQUIRED",
        severity: "warning",
        message:
          "Engineer-assigned candidate classification; semantic meaning is not automatically verified.",
      },
    ],
    metadata: {
      manualClassification: path.classification,
      extractionAlgorithm: input.extraction.algorithmVersion,
      calibrationMethod: input.calibration.method,
      calibrationPage: input.calibration.pageNumber,
      enteredDistance: input.calibration.enteredDistance,
      enteredUnit: input.calibration.unit,
      metresPerPdfPoint: input.calibration.metresPerPoint,
      calibrationRevision: input.calibration.revision,
      sourceReviewState: path.reviewState,
    },
    createdAt: input.importedAt,
    updatedAt: input.importedAt,
    text: "Planar vector geometry; no height or engineering semantics inferred.",
    annotationType: "unresolved-label",
  }));
  const allPoints = objects.flatMap((object) =>
    object.geometry.type === "polyline" ? object.geometry.points : [],
  );
  scene.sceneId = "00000000-0000-4000-8000-000000000002";
  scene.createdAt = input.importedAt;
  scene.updatedAt = input.importedAt;
  scene.coordinateSystem = {
    type: "local",
    name: "Manually calibrated PDF drawing plane",
    origin: { x: 0, y: 0, z: 0 },
  };
  scene.bounds = {
    minimum: {
      x: Math.min(...allPoints.map((point) => point.x)),
      y: Math.min(...allPoints.map((point) => point.y)),
      z: 0,
    },
    maximum: {
      x: Math.max(...allPoints.map((point) => point.x)),
      y: Math.max(...allPoints.map((point) => point.y)),
      z: 0,
    },
  };
  scene.objects = objects;
  scene.sourceDocuments = [source];
  const excluded = input.extraction.paths
    .filter((path) => path.reviewState === "excluded")
    .map((path) => path.id);
  const unresolved = input.extraction.paths
    .filter((path) => path.reviewState !== "accepted" && path.reviewState !== "excluded")
    .map((path) => path.id);
  scene.revisions = [
    {
      id: "00000000-0000-4000-8000-000000000003",
      revisionNumber: 1,
      label: "Vector extraction review",
      createdAt: input.importedAt,
      sourceDocumentIds: [sourceId],
      summary:
        `Calibration revision ${input.calibration.revision}; excluded: ${excluded.join(", ") || "none"}; unresolved: ${unresolved.join(", ") || "none"}; findings: ${input.extraction.findings.map((finding) => finding.code).join(", ") || "none"}`.slice(
          0,
          2_000,
        ),
    },
  ];
  scene.reviewSummary = {
    status: "in-review",
    unresolvedObjectCount: objects.length,
    warningCount: objects.length + input.extraction.findings.length,
  };
  const validation = validateDraflioScene(scene);
  if (!validation.valid) throw new Error("Generated drawing scene failed schema validation.");
  return scene;
}
