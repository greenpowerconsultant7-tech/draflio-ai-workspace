import assert from "node:assert/strict";
import {
  importWeatherText,
  parseCsv,
  validateWeather,
} from "../shared/renewableEnergy/weather/weatherCore";
import {
  serializeCanonicalCsv,
  serializeFindingsCsv,
} from "../shared/renewableEnergy/weather/weatherSerialization";
const options = {
  project: { projectId: "p1", projectName: "Project" },
  filename: "weather.csv",
  mimeType: "text/csv",
  format: "draflio-csv" as const,
  timezone: { kind: "fixed-offset" as const, value: "+00:00", offsetMinutes: 0 },
  latitude: 10,
  longitude: 20,
  elevationMetres: 5,
  sourceName: "fixture",
  mapping: {
    timestamp: "timestamp",
    ghi: "GHI",
    dni: "DNI",
    dhi: "DHI",
    ambientTemperature: "temperature",
    windSpeed: "wind_speed",
    stationStatus: "status",
  },
  units: { ghi: "W/m²", dni: "W/m²", dhi: "W/m²", ambientTemperature: "°C", windSpeed: "m/s" },
  importedAt: "2026-01-01T00:00:00.000Z",
  sourceId: "s1",
  sourceHash: "hash",
};
const text =
  'timestamp,GHI,DNI,DHI,temperature,wind_speed,status\n2026-01-01T00:00:00Z,0,0,0,20,2,"=alert"\n2026-01-01T01:00:00Z,0,0,0,21,3,ok\n2026-01-01T03:00:00Z,-1,0,0,999,-2,ok';
const imported = importWeatherText(text, options);
assert.equal(imported.dataset.versions[0].records.length, 3);
const version = imported.dataset.versions[0];
const validated = validateWeather(version.records, version.source.interval, version.source);
assert.equal(validated.summary.missingTimestamps, 1);
assert(validated.findings.some((finding) => finding.code === "VARIABLE_PHYSICALLY_INVALID"));
assert(serializeCanonicalCsv(validated).includes("'=alert"));
assert(serializeFindingsCsv(validated).startsWith("finding_code,severity"));
assert.deepEqual(parseCsv('a,b\n"x,y","z""q"'), [
  ["a", "b"],
  ["x,y", 'z"q'],
]);
const localTimestamp = importWeatherText(
  "timestamp,GHI,DNI,DHI,temperature,wind_speed\n2026-01-01T00:00:00,0,0,0,20,2",
  { ...options, timezone: { kind: "fixed-offset", value: "+05:30", offsetMinutes: 330 } },
);
assert.equal(localTimestamp.dataset.versions[0].records[0].timestamp, "2025-12-31T18:30:00.000Z");
assert.throws(
  () =>
    importWeatherText(
      "timestamp,GHI,DNI,DHI,temperature,wind_speed\n2026-02-30T00:00:00,0,0,0,20,2",
      options,
    ),
  /Impossible calendar timestamp/,
);
const epwHeader = [
  "LOCATION,Test,Region,Country,Provider,Station,10,20,5.5,100",
  "DESIGN CONDITIONS,0",
  "TYPICAL/EXTREME PERIODS,0",
  "GROUND TEMPERATURES,0",
  "HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0",
  "COMMENTS 1,test",
  "COMMENTS 2,test",
  "DATA PERIODS,1,1,Data,Sunday,1/1,12/31",
];
const epwRow = [
  "2025",
  "1",
  "1",
  "1",
  "60",
  "?",
  "20",
  "10",
  "50",
  "101325",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "180",
  "2",
  "5",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
].join(",");
const epw = importWeatherText([...epwHeader, epwRow].join("\n"), {
  ...options,
  filename: "test.epw",
  format: "epw",
});
assert.equal(epw.dataset.versions[0].records[0].timestamp, "2024-12-31T19:30:00.000Z");
console.log("weather core: 12 checks passed");
