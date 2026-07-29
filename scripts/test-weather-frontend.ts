import assert from "node:assert/strict";
import {
  WEATHER_MODEL_REGISTRY,
  WEATHER_TRANSITIONS,
} from "../shared/renewableEnergy/weather/weatherTypes";
import { safeWeatherFilename } from "../shared/renewableEnergy/weather/weatherSerialization";
assert(WEATHER_TRANSITIONS.Reviewed.includes("Approved for preliminary modelling"));
assert(!WEATHER_TRANSITIONS.Imported.includes("Approved for preliminary modelling"));
assert.equal(
  WEATHER_MODEL_REGISTRY.filter((model) => model.validationStatus === "available").length,
  1,
);
assert.equal(safeWeatherFilename("../../bad name.csv", "review.json"), "bad-name.csv-review.json");
console.log("weather frontend: 4 checks passed");
