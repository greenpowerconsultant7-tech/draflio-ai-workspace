import {
  TERRAIN_LIMITS,
  type TerrainAnalysis,
  type TerrainConfig,
  type TerrainContour,
  type TerrainGrid,
  type TerrainMesh,
  type TerrainPoint,
  type TerrainProgressReporter,
  type TerrainQuality,
} from "./terrainTypes";

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const quantile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) * fraction)];
};
const bounds = (points: TerrainPoint[]) => ({
  minX: Math.min(...points.map((p) => p.x)),
  minY: Math.min(...points.map((p) => p.y)),
  minZ: Math.min(...points.map((p) => p.z)),
  maxX: Math.max(...points.map((p) => p.x)),
  maxY: Math.max(...points.map((p) => p.y)),
  maxZ: Math.max(...points.map((p) => p.z)),
});

export function inspectTerrainQuality(
  points: TerrainPoint[],
  duplicates = 0,
  conflicts = 0,
): TerrainQuality {
  const box = bounds(points);
  const area = Math.max((box.maxX - box.minX) * (box.maxY - box.minY), 1);
  const sampleStep = Math.max(1, Math.ceil(points.length / 5_000));
  const spacing: number[] = [];
  for (let i = 0; i < points.length; i += sampleStep) {
    let nearest = Infinity;
    const point = points[i];
    for (let j = 0; j < points.length; j += sampleStep)
      if (i !== j)
        nearest = Math.min(nearest, Math.hypot(point.x - points[j].x, point.y - points[j].y));
    if (Number.isFinite(nearest)) spacing.push(nearest);
  }
  const medianSpacing = spacing.length ? median(spacing) : null;
  const grid = detectRegularGrid(points);
  const zs = points.map((p) => p.z);
  const zMedian = median(zs);
  const deviations = zs.map((z) => Math.abs(z - zMedian));
  const mad = median(deviations);
  const spikePointIndices = points.flatMap((p, i) =>
    (mad > 0 && Math.abs(p.z - zMedian) > 8 * mad) || (mad === 0 && Math.abs(p.z - zMedian) > 0)
      ? [i]
      : [],
  );
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const q1x = quantile(xs, 0.25);
  const q3x = quantile(xs, 0.75);
  const q1y = quantile(ys, 0.25);
  const q3y = quantile(ys, 0.75);
  const iqrX = q3x - q1x;
  const iqrY = q3y - q1y;
  const coordinateOutlierIndices = points.flatMap((point, index) =>
    (iqrX > 0 && (point.x < q1x - 3 * iqrX || point.x > q3x + 3 * iqrX)) ||
    (iqrY > 0 && (point.y < q1y - 3 * iqrY || point.y > q3y + 3 * iqrY))
      ? [index]
      : [],
  );
  const isolationThreshold = (medianSpacing ?? 0) * 5;
  const isolatedPointIndices = spacing.flatMap((distance, i) =>
    distance > isolationThreshold && isolationThreshold > 0 ? [i * sampleStep] : [],
  );
  return {
    pointCount: points.length,
    duplicateCount: duplicates,
    conflictingDuplicateCount: conflicts,
    isolatedPointIndices,
    spikePointIndices,
    coordinateOutlierIndices,
    medianSpacing,
    density: points.length / area,
    likelyRegularGrid: grid.regular,
    missingCellEstimate: grid.missingCells,
  };
}

export function detectRegularGrid(points: TerrainPoint[]) {
  if (points.length < 4)
    return { regular: false, spacing: 0, rows: 0, columns: 0, missingCells: 0, duplicateCells: 0 };
  const uniqueX = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const uniqueY = [...new Set(points.map((p) => p.y))].sort((a, b) => a - b);
  const deltas = [
    ...uniqueX.slice(1).map((x, i) => x - uniqueX[i]),
    ...uniqueY.slice(1).map((y, i) => y - uniqueY[i]),
  ].filter((n) => n > 0);
  const spacing = median(deltas);
  if (!(spacing > 0))
    return { regular: false, spacing: 0, rows: 0, columns: 0, missingCells: 0, duplicateCells: 0 };
  const tolerance = spacing * 0.02;
  const aligned =
    deltas.filter(
      (delta) =>
        Math.abs(delta - spacing) <= tolerance ||
        Math.abs(delta / spacing - Math.round(delta / spacing)) <= 0.02,
    ).length /
      deltas.length >=
    0.95;
  const cells = uniqueX.length * uniqueY.length;
  return {
    regular: aligned && cells <= TERRAIN_LIMITS.maxGridCells && points.length / cells >= 0.75,
    spacing,
    rows: uniqueY.length,
    columns: uniqueX.length,
    missingCells: Math.max(0, cells - points.length),
    duplicateCells: Math.max(0, points.length - cells),
  };
}

class SpatialBuckets {
  private buckets = new Map<string, TerrainPoint[]>();
  constructor(
    private points: TerrainPoint[],
    private size: number,
  ) {
    for (const point of points) {
      const key = this.key(point.x, point.y);
      const list = this.buckets.get(key) ?? [];
      list.push(point);
      this.buckets.set(key, list);
    }
  }
  private key(x: number, y: number) {
    return `${Math.floor(x / this.size)}:${Math.floor(y / this.size)}`;
  }
  neighbours(x: number, y: number, radius: number, max: number) {
    const result: { point: TerrainPoint; distance: number }[] = [];
    const range = Math.ceil(radius / this.size);
    const bx = Math.floor(x / this.size),
      by = Math.floor(y / this.size);
    for (let ix = bx - range; ix <= bx + range; ix++)
      for (let iy = by - range; iy <= by + range; iy++)
        for (const point of this.buckets.get(`${ix}:${iy}`) ?? []) {
          const distance = Math.hypot(point.x - x, point.y - y);
          if (distance <= radius) result.push({ point, distance });
        }
    return result
      .sort((a, b) => a.distance - b.distance || a.point.sourceIndex - b.point.sourceIndex)
      .slice(0, max);
  }
}

export function createTerrainGrid(
  points: TerrainPoint[],
  config: TerrainConfig,
  cancelled: () => boolean = () => false,
  report?: TerrainProgressReporter,
): TerrainGrid {
  if (
    config.gridSpacing <= 0 ||
    config.idwPower < 1 ||
    config.idwPower > 4 ||
    config.minNeighbours < 1 ||
    config.maxNeighbours < config.minNeighbours ||
    config.maxNeighbours > 64
  )
    throw new Error("Interpolation configuration is outside supported limits.");
  const box = bounds(points);
  const columns = Math.floor((box.maxX - box.minX) / config.gridSpacing) + 1;
  const rows = Math.floor((box.maxY - box.minY) / config.gridSpacing) + 1;
  if (
    rows > TERRAIN_LIMITS.maxGridRows ||
    columns > TERRAIN_LIMITS.maxGridColumns ||
    rows * columns > TERRAIN_LIMITS.maxGridCells
  )
    throw new Error("Requested terrain grid exceeds processing limits.");
  report?.("detecting-grid");
  const detected = detectRegularGrid(points);
  const direct =
    detected.regular &&
    Math.abs(detected.spacing - config.gridSpacing) <= config.gridSpacing * 0.02;
  const exact = new Map(
    points.map((p) => [
      `${Math.round((p.x - box.minX) / config.gridSpacing)}:${Math.round((p.y - box.minY) / config.gridSpacing)}`,
      p.z,
    ]),
  );
  report?.("building-spatial-index");
  const index = direct
    ? null
    : new SpatialBuckets(points, Math.max(config.gridSpacing, config.searchRadius / 4));
  const elevations: Array<number | null> = [];
  let filledCells = 0;
  report?.("interpolating");
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      if (cancelled()) throw new Error("CANCELLED");
      const key = `${column}:${row}`;
      const known = exact.get(key);
      if (known !== undefined) {
        elevations.push(known);
        filledCells++;
        continue;
      }
      if (direct) {
        elevations.push(null);
        continue;
      }
      const x = box.minX + column * config.gridSpacing,
        y = box.minY + row * config.gridSpacing;
      const nearby = index?.neighbours(x, y, config.searchRadius, config.maxNeighbours) ?? [];
      if (nearby.length < config.minNeighbours) {
        elevations.push(null);
        continue;
      }
      const exactPoint = nearby.find((item) => item.distance === 0);
      const z = exactPoint
        ? exactPoint.point.z
        : nearby.reduce((sum, item) => sum + item.point.z / item.distance ** config.idwPower, 0) /
          nearby.reduce((sum, item) => sum + 1 / item.distance ** config.idwPower, 0);
      elevations.push(Number.isFinite(z) ? z : null);
      if (Number.isFinite(z)) filledCells++;
    }
  return {
    originX: box.minX,
    originY: box.minY,
    spacing: config.gridSpacing,
    rows,
    columns,
    elevations,
    interpolated: !direct,
    filledCells,
    noDataCells: rows * columns - filledCells,
  };
}

export function buildTerrainMesh(grid: TerrainGrid): TerrainMesh {
  const vertices: TerrainMesh["vertices"] = [];
  const indexMap = new Array<number>(grid.elevations.length).fill(-1);
  grid.elevations.forEach((z, index) => {
    if (z === null) return;
    const row = Math.floor(index / grid.columns),
      column = index % grid.columns;
    indexMap[index] = vertices.length;
    vertices.push({
      x: grid.originX + column * grid.spacing,
      y: grid.originY + row * grid.spacing,
      z,
    });
  });
  const triangles: [number, number, number][] = [];
  for (let row = 0; row < grid.rows - 1; row++)
    for (let column = 0; column < grid.columns - 1; column++) {
      const a = indexMap[row * grid.columns + column],
        b = indexMap[row * grid.columns + column + 1],
        c = indexMap[(row + 1) * grid.columns + column],
        d = indexMap[(row + 1) * grid.columns + column + 1];
      if ([a, b, c, d].every((i) => i >= 0)) {
        triangles.push([a, b, d], [a, d, c]);
      }
    }
  return { vertices, triangles };
}

export function calculateSlopeAspect(grid: TerrainGrid) {
  const slopes: Array<number | null> = new Array(grid.elevations.length).fill(null);
  const aspects: Array<number | null> = new Array(grid.elevations.length).fill(null);
  for (let row = 1; row < grid.rows - 1; row++)
    for (let column = 1; column < grid.columns - 1; column++) {
      const left = grid.elevations[row * grid.columns + column - 1],
        right = grid.elevations[row * grid.columns + column + 1],
        down = grid.elevations[(row - 1) * grid.columns + column],
        up = grid.elevations[(row + 1) * grid.columns + column];
      if ([left, right, down, up].some((v) => v === null)) continue;
      const dzdx = (right! - left!) / (2 * grid.spacing),
        dzdy = (up! - down!) / (2 * grid.spacing);
      const index = row * grid.columns + column;
      slopes[index] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
      aspects[index] =
        Math.abs(dzdx) < 1e-12 && Math.abs(dzdy) < 1e-12
          ? null
          : ((Math.atan2(-dzdx, -dzdy) * 180) / Math.PI + 360) % 360;
    }
  return { slopes, aspects };
}

export function screenBuildability(
  slopes: Array<number | null>,
  preferred: number,
  review: number,
) {
  if (!(preferred >= 0 && preferred < review && review <= 60))
    throw new Error("Slope thresholds are invalid.");
  return slopes.map((s) =>
    s === null
      ? ("no-data" as const)
      : s <= preferred
        ? ("preferred" as const)
        : s <= review
          ? ("review-required" as const)
          : ("excluded-by-slope" as const),
  );
}

export function calculateContours(grid: TerrainGrid, interval: number): TerrainContour[] {
  if (!(interval > 0 && interval <= 10_000)) throw new Error("Contour interval is invalid.");
  const finite = grid.elevations.filter((v): v is number => v !== null);
  if (!finite.length) return [];
  const min = Math.ceil(Math.min(...finite) / interval) * interval,
    max = Math.floor(Math.max(...finite) / interval) * interval;
  const map = new Map<number, TerrainContour>();
  for (let level = min; level <= max; level += interval)
    map.set(level, { elevation: level, segments: [] });
  const edge = (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    level: number,
  ): [number, number] | null => {
    if (z1 < level === z2 < level || z1 === z2) return null;
    const t = (level - z1) / (z2 - z1);
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };
  for (let row = 0; row < grid.rows - 1; row++)
    for (let column = 0; column < grid.columns - 1; column++) {
      const values = [
        grid.elevations[row * grid.columns + column],
        grid.elevations[row * grid.columns + column + 1],
        grid.elevations[(row + 1) * grid.columns + column + 1],
        grid.elevations[(row + 1) * grid.columns + column],
      ];
      if (values.some((v) => v === null)) continue;
      const x = grid.originX + column * grid.spacing,
        y = grid.originY + row * grid.spacing;
      for (const contour of map.values()) {
        const intersections = [
          edge(x, y, values[0]!, x + grid.spacing, y, values[1]!, contour.elevation),
          edge(
            x + grid.spacing,
            y,
            values[1]!,
            x + grid.spacing,
            y + grid.spacing,
            values[2]!,
            contour.elevation,
          ),
          edge(
            x + grid.spacing,
            y + grid.spacing,
            values[2]!,
            x,
            y + grid.spacing,
            values[3]!,
            contour.elevation,
          ),
          edge(x, y + grid.spacing, values[3]!, x, y, values[0]!, contour.elevation),
        ].filter((p): p is [number, number] => p !== null);
        if (intersections.length >= 2) {
          contour.segments.push([intersections[0], intersections[1]]);
          if (contour.segments.length > TERRAIN_LIMITS.maxContourSegments)
            throw new Error("Contour segment limit exceeded.");
        }
      }
    }
  return [...map.values()].filter((c) => c.segments.length);
}

export function analyzeTerrain(
  points: TerrainPoint[],
  config: TerrainConfig,
  duplicates = 0,
  conflicts = 0,
  cancelled: () => boolean = () => false,
  report?: TerrainProgressReporter,
): TerrainAnalysis {
  const start = performance.now();
  report?.("checking-quality");
  const quality = inspectTerrainQuality(points, duplicates, conflicts);
  const grid = createTerrainGrid(points, config, cancelled, report);
  report?.("building-mesh");
  const mesh = buildTerrainMesh(grid);
  report?.("calculating-contours");
  const contours = calculateContours(grid, config.contourInterval);
  report?.("calculating-slope-aspect");
  const { slopes, aspects } = calculateSlopeAspect(grid);
  report?.("screening-buildability");
  const buildability = screenBuildability(slopes, config.preferredSlope, config.reviewSlope);
  return {
    grid,
    mesh,
    contours,
    slopes,
    aspects,
    buildability,
    quality,
    durationMs: performance.now() - start,
  };
}
