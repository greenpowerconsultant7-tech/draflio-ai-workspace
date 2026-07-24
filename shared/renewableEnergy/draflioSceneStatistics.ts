import type { DraflioScene } from "./draflioSceneTypes";

export interface DraflioSceneStatistics {
  objectCount: number;
  reviewedObjectCount: number;
  needsReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  sourceDocumentCount: number;
  revisionCount: number;
  objectCountsByType: Record<string, number>;
  geometryCountsByKind: Record<string, number>;
  totalVertexCount: number;
  totalTriangleCount: number;
  objectsWithoutSourceReferences: number;
  objectsWithExtractionWarnings: number;
}

export function getDraflioSceneStatistics(scene: DraflioScene): DraflioSceneStatistics {
  const result: DraflioSceneStatistics = {
    objectCount: scene.objects.length,
    reviewedObjectCount: 0,
    needsReviewCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    sourceDocumentCount: scene.sourceDocuments.length,
    revisionCount: scene.revisions.length,
    objectCountsByType: {},
    geometryCountsByKind: {},
    totalVertexCount: 0,
    totalTriangleCount: 0,
    objectsWithoutSourceReferences: 0,
    objectsWithExtractionWarnings: 0,
  };
  for (const object of scene.objects) {
    result.objectCountsByType[object.kind] = (result.objectCountsByType[object.kind] ?? 0) + 1;
    result.geometryCountsByKind[object.geometry.type] =
      (result.geometryCountsByKind[object.geometry.type] ?? 0) + 1;
    if (object.reviewStatus !== "unreviewed") result.reviewedObjectCount++;
    if (object.reviewStatus === "needs-review") result.needsReviewCount++;
    if (object.reviewStatus === "approved") result.approvedCount++;
    if (object.reviewStatus === "rejected") result.rejectedCount++;
    if (object.sourceReferences.length === 0) result.objectsWithoutSourceReferences++;
    if (object.warnings.length > 0) result.objectsWithExtractionWarnings++;
    if (object.geometry.type === "mesh") {
      result.totalVertexCount += object.geometry.vertices.length;
      result.totalTriangleCount += object.geometry.triangles.length;
    } else if (object.geometry.type === "polyline")
      result.totalVertexCount += object.geometry.points.length;
    else if (object.geometry.type === "polygon")
      result.totalVertexCount +=
        object.geometry.outerRing.length +
        object.geometry.holes.reduce((sum, hole) => sum + hole.length, 0);
    else if (object.geometry.type === "point") result.totalVertexCount += 1;
  }
  return result;
}
