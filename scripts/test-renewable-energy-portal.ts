import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RENEWABLE_SECTORS } from "../src/features/renewable-energy/renewableEnergyCatalog";
import {
  SOLAR_FEATURES,
  isSolarFeatureId,
} from "../src/features/renewable-energy/solar/solarFeatureCatalog";

assert.equal(RENEWABLE_SECTORS.length, 4);
assert.equal(new Set(RENEWABLE_SECTORS.map((sector) => sector.id)).size, 4);
assert.equal(new Set(RENEWABLE_SECTORS.map((sector) => sector.route)).size, 4);
assert.equal(
  RENEWABLE_SECTORS.find((sector) => sector.id === "solar")?.status,
  "Active development",
);
assert.ok(
  RENEWABLE_SECTORS.filter((sector) => sector.id !== "solar").every(
    (sector) => sector.status === "Planned",
  ),
);
assert.equal(SOLAR_FEATURES.length, 9);
assert.equal(new Set(SOLAR_FEATURES.map((feature) => feature.id)).size, 9);
assert.equal(new Set(SOLAR_FEATURES.map((feature) => feature.route)).size, 9);
assert.ok(SOLAR_FEATURES.some((feature) => feature.id === "weather"));
for (const feature of SOLAR_FEATURES) {
  assert.equal(feature.route, `/renewable-energy/solar/${feature.id}`);
  assert.ok(isSolarFeatureId(feature.id));
  assert.ok(feature.title && feature.description && feature.limitations);
  assert.doesNotThrow(() => JSON.stringify(feature));
}
assert.equal(isSolarFeatureId("unknown"), false);

const header = readFileSync("src/components/draflio/Header.tsx", "utf8");
assert.equal((header.match(/label: "Renewable Energy"/g) ?? []).length, 1);
assert.match(header, /label: "Engineering"/);
const detail = readFileSync("src/features/renewable-energy/solar/SolarFeatureDetail.tsx", "utf8");
assert.match(detail, /not affiliated with or endorsed by PVsyst/);
const route = readFileSync("src/routes/renewable-energy.solar.$featureId.tsx", "utf8");
assert.match(route, /throw notFound\(\)/);
console.log("Renewable Energy portal checks passed.");
