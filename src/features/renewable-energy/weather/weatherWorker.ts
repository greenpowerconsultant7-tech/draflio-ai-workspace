/// <reference lib="webworker" />
import { validateWeather } from "../../../../shared/renewableEnergy/weather/weatherCore";
import type {
  CanonicalWeatherRecord,
  SamplingIntervalDefinition,
  TimezoneDefinition,
} from "../../../../shared/renewableEnergy/weather/weatherTypes";
type Request = {
  type: "validate";
  generation: number;
  records: CanonicalWeatherRecord[];
  interval: SamplingIntervalDefinition | null;
  source: {
    latitude: number | null;
    longitude: number | null;
    timezone: TimezoneDefinition | null;
    sourceUnits: Record<string, string>;
  };
};
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (!request || request.type !== "validate" || !Number.isSafeInteger(request.generation)) return;
  self.postMessage({
    type: "progress",
    generation: request.generation,
    percent: 10,
    stage: "Validating time series",
  });
  try {
    const result = validateWeather(request.records, request.interval, request.source);
    self.postMessage({
      type: "progress",
      generation: request.generation,
      percent: 100,
      stage: "Complete",
    });
    self.postMessage({ type: "success", generation: request.generation, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      generation: request.generation,
      message: error instanceof Error ? error.message : "Weather validation failed.",
    });
  }
};
