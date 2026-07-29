import {
  WEATHER_LIMITS,
  WEATHER_PARSER_VERSION,
  WEATHER_VALIDATION_VERSION,
  type CanonicalWeatherRecord,
  type SamplingIntervalDefinition,
  type TimezoneDefinition,
  type WeatherColumnMapping,
  type WeatherImportResult,
  type WeatherQualityFinding,
  type WeatherResourceProjectReference,
  type WeatherSourceFormat,
  type WeatherValidationResult,
  type WeatherVariable,
} from "./weatherTypes";
import { calculateSunPosition } from "../shading/shadingCore";

type ImportOptions = {
  project: WeatherResourceProjectReference;
  filename: string;
  mimeType: string;
  format: WeatherSourceFormat;
  timezone?: TimezoneDefinition;
  latitude?: number;
  longitude?: number;
  elevationMetres?: number;
  sourceName: string;
  notes?: string;
  mapping?: WeatherColumnMapping;
  units?: Record<string, string>;
  importedAt: string;
  sourceId: string;
  sourceHash: string;
};
const required: WeatherVariable[] = [
  "timestamp",
  "ghi",
  "dni",
  "dhi",
  "ambientTemperature",
  "windSpeed",
];
const canonicalUnits: Record<string, string> = {
  ghi: "W/m²",
  dni: "W/m²",
  dhi: "W/m²",
  ambientTemperature: "°C",
  windSpeed: "m/s",
  relativeHumidity: "%",
  atmosphericPressure: "Pa",
  precipitation: "mm",
  albedo: "1",
  windDirection: "°",
};

function finding(
  code: string,
  severity: WeatherQualityFinding["severity"],
  explanation: string,
  modellingBlocked: boolean,
  detail: Partial<WeatherQualityFinding> = {},
): WeatherQualityFinding {
  return {
    id: [
      code,
      detail.variable ?? "dataset",
      detail.sourceRow ?? detail.startTimestamp ?? "dataset",
      detail.endTimestamp ?? "",
    ].join(":"),
    code,
    severity,
    explanation,
    modellingBlocked,
    recommendedAction: modellingBlocked
      ? "Correct the source or reviewed import configuration, then validate again."
      : "Review and acknowledge with an engineering note where appropriate.",
    evidence: explanation,
    validationVersion: WEATHER_VALIDATION_VERSION,
    acknowledged: false,
    ...detail,
  };
}
export function parseCsv(text: string): string[][] {
  if (text.includes("\0")) throw new Error("Embedded null characters are not supported.");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      if (field) throw new Error("Invalid quoted field.");
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
    if (field.length > WEATHER_LIMITS.maxFieldLength)
      throw new Error("Field length limit exceeded.");
  }
  if (quoted) throw new Error("Unclosed quoted field.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.length));
}
function numberValue(
  raw: string,
  unit: string | undefined,
  variable: WeatherVariable,
): { value: number | null; conversion: string } {
  if (raw.trim() === "") return { value: null, conversion: "missing" };
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Non-finite ${variable}.`);
  const normalized = unit?.trim().toLowerCase();
  if (variable === "ambientTemperature" && normalized === "°f")
    return { value: ((value - 32) * 5) / 9, conversion: "°F→°C" };
  if (variable === "windSpeed" && (normalized === "km/h" || normalized === "kmh"))
    return { value: value / 3.6, conversion: "km/h→m/s" };
  if (variable === "atmosphericPressure" && normalized === "hpa")
    return { value: value * 100, conversion: "hPa→Pa" };
  const expected = canonicalUnits[variable];
  if (unit && expected && normalized !== expected.toLowerCase())
    throw new Error(`Unsupported unit ${unit} for ${variable}.`);
  return { value, conversion: "identity" };
}
function isoFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  epw: boolean,
  offsetMinutes: number,
): string {
  if (epw && (hour < 1 || hour > 24)) throw new Error("EPW hour must be 1–24.");
  if (minute < 0 || minute > 60) throw new Error("Minute is outside the supported range.");
  const endingMinutes = epw ? (hour - 1) * 60 + minute : hour * 60 + minute;
  const local = Date.UTC(year, month - 1, day, 0, endingMinutes);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    throw new Error("Impossible calendar date.");
  return new Date(local - offsetMinutes * 60_000).toISOString();
}
function parseMappedTimestamp(raw: string, timezone: TimezoneDefinition): string {
  const value = raw.trim();
  if (!value) throw new Error("Timestamp is empty.");
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const instant = new Date(value);
    if (!Number.isFinite(instant.getTime())) throw new Error("Invalid timestamp.");
    return instant.toISOString();
  }
  if (timezone.kind !== "fixed-offset" || !Number.isFinite(timezone.offsetMinutes))
    throw new Error("Offset-less timestamps require a fixed UTC offset.");
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
    value,
  );
  if (!match) throw new Error("Timestamp must use an ISO 8601 date and time.");
  const [, year, month, day, hour, minute, second = "0", fraction = "0"] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [y, m, d, h, min, sec] = parts;
  const milliseconds = Number(fraction.padEnd(3, "0"));
  const local = Date.UTC(y, m - 1, d, h, min, sec, milliseconds);
  const check = new Date(local);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d ||
    check.getUTCHours() !== h ||
    check.getUTCMinutes() !== min ||
    check.getUTCSeconds() !== sec
  )
    throw new Error("Impossible calendar timestamp.");
  return new Date(local - timezone.offsetMinutes! * 60_000).toISOString();
}
function parseEpw(text: string, options: ImportOptions) {
  const rows = parseCsv(text);
  if (rows.length < 9 || rows[0][0] !== "LOCATION") throw new Error("Malformed EPW header block.");
  const location = rows[0];
  if (location.length < 10) throw new Error("Truncated EPW LOCATION header.");
  const periods = rows[7];
  if (periods[0] !== "DATA PERIODS") throw new Error("Missing EPW DATA PERIODS header.");
  const latitude = Number(location[6]),
    longitude = Number(location[7]),
    offsetHours = Number(location[8]),
    elevation = Number(location[9]);
  if (![latitude, longitude, offsetHours, elevation].every(Number.isFinite))
    throw new Error("Invalid EPW location metadata.");
  const timezone: TimezoneDefinition = {
    kind: "fixed-offset",
    value: `${offsetHours >= 0 ? "+" : ""}${offsetHours}`,
    offsetMinutes: offsetHours * 60,
  };
  const records = rows.slice(8).map((columns, index): CanonicalWeatherRecord => {
    if (columns.length < 35) throw new Error(`Truncated EPW record at source row ${index + 9}.`);
    const year = Number(columns[0]),
      month = Number(columns[1]),
      day = Number(columns[2]),
      hour = Number(columns[3]),
      minute = Number(columns[4]);
    const timestamp = isoFromParts(
      year,
      month,
      day,
      hour,
      minute,
      true,
      timezone.offsetMinutes ?? 0,
    );
    const values: CanonicalWeatherRecord["values"] = {
      ambientTemperature: Number(columns[6]),
      relativeHumidity: Number(columns[8]),
      atmosphericPressure: Number(columns[9]),
      ghi: Number(columns[13]),
      dni: Number(columns[14]),
      dhi: Number(columns[15]),
      windDirection: Number(columns[20]),
      windSpeed: Number(columns[21]),
      totalSkyCover: Number(columns[22]),
      precipitation: Number(columns[33]),
    };
    if (
      !Object.values(values).every(
        (value) => value === null || typeof value === "string" || Number.isFinite(value),
      )
    )
      throw new Error(`Non-finite EPW value at source row ${index + 9}.`);
    return {
      timestamp,
      timezone: timezone.value,
      sourceRow: index + 9,
      values,
      qualityFlags: [],
      conversionStatus: ["EPW hour-ending timestamp converted to UTC instant"],
    };
  });
  return {
    records,
    timezone,
    latitude,
    longitude,
    elevation,
    metadata: {
      location: location[1],
      region: location[2],
      country: location[3],
      provider: location[4],
      stationId: location[5],
      dataPeriods: periods.slice(1).join(","),
    },
    units: {
      ghi: "W/m²",
      dni: "W/m²",
      dhi: "W/m²",
      ambientTemperature: "°C",
      windSpeed: "m/s",
      atmosphericPressure: "Pa",
    },
  };
}
function parseMapped(text: string, options: ImportOptions) {
  if (!options.timezone) throw new Error("Timezone or UTC offset is required.");
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV has no data records.");
  const headers = rows[0];
  if (
    headers.join(",").length > WEATHER_LIMITS.maxHeaderLength ||
    headers.length > WEATHER_LIMITS.maxColumns
  )
    throw new Error("CSV header limit exceeded.");
  const mapping =
    options.mapping ??
    Object.fromEntries(headers.map((header) => [header.trim() as WeatherVariable, header]));
  const mapped = Object.values(mapping).filter(Boolean);
  if (new Set(mapped).size !== mapped.length)
    throw new Error("A source column cannot be mapped twice.");
  for (const variable of required)
    if (!mapping[variable] && !(variable === "timestamp" && mapping.date && mapping.time))
      throw new Error(`Missing required mapping: ${variable}.`);
  const offset = options.timezone.offsetMinutes;
  if (options.timezone.kind === "fixed-offset" && !Number.isFinite(offset))
    throw new Error("Invalid timezone offset.");
  const indexFor = (key: keyof WeatherColumnMapping) => headers.indexOf(mapping[key] ?? "");
  const records = rows.slice(1).map((columns, rowIndex): CanonicalWeatherRecord => {
    if (columns.length !== headers.length)
      throw new Error(`Inconsistent column count at row ${rowIndex + 2}.`);
    let timestampRaw = columns[indexFor("timestamp")];
    if (!timestampRaw && mapping.date && mapping.time)
      timestampRaw = `${columns[indexFor("date")]}T${columns[indexFor("time")]}`;
    let timestamp: string;
    try {
      timestamp = parseMappedTimestamp(timestampRaw, options.timezone!);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid timestamp.";
      throw new Error(`Invalid timestamp at row ${rowIndex + 2}: ${detail}`);
    }
    const values: CanonicalWeatherRecord["values"] = {};
    const conversionStatus: string[] = [];
    for (const variable of Object.keys(canonicalUnits) as WeatherVariable[]) {
      const columnIndex = indexFor(variable);
      if (columnIndex < 0) continue;
      const converted = numberValue(columns[columnIndex], options.units?.[variable], variable);
      values[variable] = converted.value;
      conversionStatus.push(`${variable}:${converted.conversion}`);
    }
    for (const variable of ["stationStatus", "sourceQualityCode"] as const) {
      const columnIndex = indexFor(variable);
      if (columnIndex >= 0) values[variable] = columns[columnIndex];
    }
    return {
      timestamp,
      timezone: options.timezone!.value,
      sourceRow: rowIndex + 2,
      values,
      qualityFlags: [],
      conversionStatus,
    };
  });
  return {
    records,
    timezone: options.timezone,
    latitude: options.latitude ?? null,
    longitude: options.longitude ?? null,
    elevation: options.elevationMetres ?? null,
    metadata: { sourceName: options.sourceName },
    units: options.units ?? {},
  };
}
export function importWeatherText(text: string, options: ImportOptions): WeatherImportResult {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (!bytes || bytes > WEATHER_LIMITS.maxFileBytes)
    throw new Error("Weather file byte limit exceeded.");
  if (text.charCodeAt(0) === 0xfffd) throw new Error("Unsupported text encoding.");
  const parsed = options.format === "epw" ? parseEpw(text, options) : parseMapped(text, options);
  if (parsed.records.length > WEATHER_LIMITS.maxRecords)
    throw new Error("Weather record limit exceeded.");
  const findings: WeatherQualityFinding[] = [];
  if (!Number.isFinite(parsed.latitude) || parsed.latitude! < -90 || parsed.latitude! > 90)
    findings.push(
      finding(
        "LOCATION_LATITUDE_INVALID",
        "Error",
        "Latitude is missing or outside -90 to 90 degrees.",
        true,
      ),
    );
  if (!Number.isFinite(parsed.longitude) || parsed.longitude! < -180 || parsed.longitude! > 180)
    findings.push(
      finding(
        "LOCATION_LONGITUDE_INVALID",
        "Error",
        "Longitude is missing or outside -180 to 180 degrees.",
        true,
      ),
    );
  const interval = inferInterval(parsed.records);
  const declaredLocation =
    "location" in parsed.metadata ? parsed.metadata.location : options.sourceName;
  const sourceProvider =
    "provider" in parsed.metadata ? parsed.metadata.provider : options.sourceName;
  const source = {
    projectId: options.project.projectId,
    sourceId: options.sourceId,
    filename: options.filename,
    format: options.format,
    mimeType: options.mimeType,
    byteSize: bytes,
    sourceHash: options.sourceHash,
    importedAt: options.importedAt,
    originalHeaderMetadata: parsed.metadata,
    declaredLocation,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    elevationMetres: parsed.elevation,
    timezone: parsed.timezone,
    sourceProvider,
    sourcePeriod: parsed.records.length
      ? `${parsed.records[0].timestamp}/${parsed.records.at(-1)!.timestamp}`
      : "",
    interval,
    sourceUnits: parsed.units,
    parserVersion: WEATHER_PARSER_VERSION,
    validationVersion: WEATHER_VALIDATION_VERSION,
    notes: options.notes ?? "",
    reviewStatus: findings.some((item) => item.modellingBlocked)
      ? ("Structurally invalid" as const)
      : ("Imported" as const),
    originalText: text,
  };
  return {
    dataset: {
      datasetId: `weather:${options.project.projectId}:${options.sourceId}`,
      project: options.project,
      versions: [
        {
          version: 1,
          createdAt: options.importedAt,
          source,
          records: parsed.records,
          findings,
          summary: null,
        },
      ],
    },
    structuralFindings: findings,
  };
}
export function inferInterval(
  records: readonly CanonicalWeatherRecord[],
): SamplingIntervalDefinition | null {
  if (records.length < 2) return null;
  const counts = new Map<number, number>();
  for (let index = 1; index < records.length; index += 1) {
    const minutes =
      (Date.parse(records[index].timestamp) - Date.parse(records[index - 1].timestamp)) / 60_000;
    if (minutes > 0) counts.set(minutes, (counts.get(minutes) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return best
    ? { minutes: best[0], basis: "inferred", confidence: best[1] / Math.max(1, records.length - 1) }
    : null;
}
export function validateWeather(
  records: readonly CanonicalWeatherRecord[],
  interval: SamplingIntervalDefinition | null,
  source: {
    latitude: number | null;
    longitude: number | null;
    timezone: TimezoneDefinition | null;
    sourceUnits: Record<string, string>;
  },
): WeatherValidationResult {
  const findings: WeatherQualityFinding[] = [];
  const seen = new Map<string, number>();
  let missing = 0;
  const add = (item: WeatherQualityFinding) => {
    if (findings.length < WEATHER_LIMITS.maxFindings) findings.push(item);
  };
  if (!Number.isFinite(source.latitude) || source.latitude! < -90 || source.latitude! > 90)
    add(
      finding(
        "LOCATION_LATITUDE_INVALID",
        "Error",
        "Latitude is missing or outside -90 to 90 degrees.",
        true,
      ),
    );
  if (!Number.isFinite(source.longitude) || source.longitude! < -180 || source.longitude! > 180)
    add(
      finding(
        "LOCATION_LONGITUDE_INVALID",
        "Error",
        "Longitude is missing or outside -180 to 180 degrees.",
        true,
      ),
    );
  if (!source.timezone)
    add(finding("TIMEZONE_MISSING", "Error", "A reviewed timezone is required.", true));
  records.forEach((record, index) => {
    if (seen.has(record.timestamp))
      add(
        finding("TIME_DUPLICATE", "Error", "Duplicate timestamp retained without repair.", true, {
          startTimestamp: record.timestamp,
          sourceRow: record.sourceRow,
          variable: "timestamp",
        }),
      );
    seen.set(record.timestamp, index);
    if (index && Date.parse(record.timestamp) < Date.parse(records[index - 1].timestamp))
      add(
        finding("TIME_OUT_OF_ORDER", "Error", "Records are not chronological.", true, {
          startTimestamp: record.timestamp,
          sourceRow: record.sourceRow,
          variable: "timestamp",
        }),
      );
    if (index && interval) {
      const gap =
        (Date.parse(record.timestamp) - Date.parse(records[index - 1].timestamp)) / 60_000;
      if (gap > interval.minutes) {
        missing += Math.max(0, Math.round(gap / interval.minutes) - 1);
        add(
          finding(
            "TIME_MISSING",
            "Warning",
            `${gap}-minute gap exceeds the ${interval.minutes}-minute interval.`,
            false,
            {
              startTimestamp: records[index - 1].timestamp,
              endTimestamp: record.timestamp,
              variable: "timestamp",
            },
          ),
        );
      } else if (gap !== interval.minutes)
        add(
          finding(
            "TIME_IRREGULAR",
            "Warning",
            `Observed interval ${gap} minutes differs from ${interval.minutes}.`,
            false,
            { startTimestamp: record.timestamp, variable: "timestamp" },
          ),
        );
    }
    const ranges: Partial<Record<WeatherVariable, [number, number, number, number]>> = {
      ghi: [0, 1600, 0, 1300],
      dni: [0, 1600, 0, 1300],
      dhi: [0, 1000, 0, 800],
      ambientTemperature: [-100, 70, -60, 55],
      windSpeed: [0, 100, 0, 60],
      relativeHumidity: [0, 100, 0, 100],
      atmosphericPressure: [30_000, 120_000, 70_000, 110_000],
      precipitation: [0, 500, 0, 200],
      albedo: [0, 1, 0, 1],
      windDirection: [0, 360, 0, 360],
    };
    for (const [variable, range] of Object.entries(ranges) as [
      WeatherVariable,
      [number, number, number, number],
    ][]) {
      const value = record.values[variable];
      if (value === null || value === undefined) {
        if (required.includes(variable))
          add(
            finding("VARIABLE_MISSING", "Error", `${variable} is missing.`, true, {
              variable,
              sourceRow: record.sourceRow,
              startTimestamp: record.timestamp,
            }),
          );
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        add(
          finding("VARIABLE_NON_FINITE", "Error", `${variable} is non-finite.`, true, {
            variable,
            sourceRow: record.sourceRow,
          }),
        );
        continue;
      }
      if (value < range[0] || value > range[1])
        add(
          finding(
            "VARIABLE_PHYSICALLY_INVALID",
            "Error",
            `${variable} value ${value} is outside documented physical bounds ${range[0]}–${range[1]}.`,
            true,
            {
              variable,
              sourceRow: record.sourceRow,
              startTimestamp: record.timestamp,
              canonicalValue: String(value),
            },
          ),
        );
      else if (value < range[2] || value > range[3])
        add(
          finding(
            "VARIABLE_PLAUSIBILITY",
            "Warning",
            `${variable} value ${value} is unusual but possible.`,
            false,
            {
              variable,
              sourceRow: record.sourceRow,
              startTimestamp: record.timestamp,
              canonicalValue: String(value),
            },
          ),
        );
    }
    if (Number.isFinite(source.latitude) && Number.isFinite(source.longitude) && source.timezone) {
      const sun = calculateSunPosition(new Date(record.timestamp), {
        latitudeDegrees: source.latitude!,
        longitudeDegrees: source.longitude!,
        projectNorthDegrees: 0,
        timezone: source.timezone.value,
        fixedOffsetMinutes: source.timezone.offsetMinutes,
        daylightSaving: "not-applicable-fixed-offset",
      });
      const irradiance = ["ghi", "dni", "dhi"] as const;
      if (
        sun.belowHorizon &&
        irradiance.some(
          (variable) =>
            typeof record.values[variable] === "number" && record.values[variable]! > 20,
        )
      )
        add(
          finding(
            "IRRADIANCE_AT_NIGHT",
            "Warning",
            "Irradiance exceeds 20 W/m² while the reviewed solar-position model is below the horizon.",
            false,
            {
              variable: "ghi",
              sourceRow: record.sourceRow,
              startTimestamp: record.timestamp,
            },
          ),
        );
      const ghi = record.values.ghi;
      const dni = record.values.dni;
      const dhi = record.values.dhi;
      if (
        !sun.belowHorizon &&
        typeof ghi === "number" &&
        typeof dni === "number" &&
        typeof dhi === "number" &&
        ghi > dni + dhi + 100
      )
        add(
          finding(
            "IRRADIANCE_INCONSISTENT",
            "Warning",
            "GHI exceeds DNI plus DHI by more than the documented 100 W/m² screening tolerance.",
            false,
            {
              variable: "ghi",
              sourceRow: record.sourceRow,
              startTimestamp: record.timestamp,
            },
          ),
        );
    }
  });
  for (const variable of required.filter((item) => item !== "timestamp")) {
    let runStart = 0;
    for (let index = 1; index <= records.length; index += 1) {
      const previous = records[index - 1]?.values[variable];
      const current = records[index]?.values[variable];
      if (index < records.length && current === previous) continue;
      const runLength = index - runStart;
      if (runLength >= 24 && previous !== null && previous !== undefined)
        add(
          finding(
            previous === 0 ? "VARIABLE_SUSPICIOUS_ZERO_RUN" : "VARIABLE_CONSTANT_RUN",
            "Warning",
            `${variable} remains ${previous} for ${runLength} consecutive records.`,
            false,
            {
              variable,
              sourceRow: records[runStart].sourceRow,
              startTimestamp: records[runStart].timestamp,
              endTimestamp: records[index - 1].timestamp,
              canonicalValue: String(previous),
            },
          ),
        );
      runStart = index;
    }
  }
  const errors = new Set(
    findings
      .filter((item) => item.severity === "Error")
      .map((item) => item.sourceRow)
      .filter((value) => value !== undefined),
  );
  const warnings = new Set(
    findings
      .filter((item) => item.severity === "Warning")
      .map((item) => item.sourceRow)
      .filter((value) => value !== undefined),
  );
  const completeness = Object.fromEntries(
    required
      .filter((v) => v !== "timestamp")
      .map((variable) => [
        variable,
        records.length
          ? records.filter((r) => r.values[variable] !== null && r.values[variable] !== undefined)
              .length / records.length
          : 0,
      ]),
  );
  const blocking =
    findings.some((item) => item.modellingBlocked) ||
    !source.timezone ||
    !Number.isFinite(source.latitude) ||
    !Number.isFinite(source.longitude);
  return {
    records: records.map((record) => ({
      ...record,
      qualityFlags: findings
        .filter((f) => f.sourceRow === record.sourceRow)
        .map((f) => ({ code: f.code, severity: f.severity })),
    })),
    findings,
    summary: {
      importedRecordCount: records.length,
      expectedRecordCount:
        interval && records.length
          ? Math.round(
              (Date.parse(records.at(-1)!.timestamp) - Date.parse(records[0].timestamp)) /
                60_000 /
                interval.minutes,
            ) + 1
          : null,
      validRecordCount: records.length - errors.size,
      invalidRecordCount: errors.size,
      warningRecordCount: warnings.size,
      missingTimestamps: missing,
      duplicateTimestamps: findings.filter((f) => f.code === "TIME_DUPLICATE").length,
      intervalConsistency: findings.some(
        (f) => f.code === "TIME_IRREGULAR" || f.code === "TIME_MISSING",
      )
        ? "irregular"
        : interval
          ? "consistent"
          : "not-evaluated",
      variableCompleteness: completeness,
      daylightIrradianceCompleteness:
        records.length && Number.isFinite(source.latitude) && Number.isFinite(source.longitude)
          ? records.filter((record) =>
              [record.values.ghi, record.values.dni, record.values.dhi].every(
                (value) => typeof value === "number",
              ),
            ).length / records.length
          : null,
      locationComplete: Number.isFinite(source.latitude) && Number.isFinite(source.longitude),
      timezoneComplete: Boolean(source.timezone),
      unitsComplete: required
        .filter((v) => v !== "timestamp")
        .every((v) => Boolean(source.sourceUnits[v])),
      sourceConfidence: blocking ? "low" : findings.length ? "medium" : "high",
      readiness: blocking
        ? "Blocked pending correction"
        : findings.length
          ? "Suitable for preliminary weather review"
          : "Suitable for preliminary irradiance modelling",
    },
  };
}
