/// <reference lib="webworker" />
import { calculateIrradiance } from "../../../../shared/renewableEnergy/irradiance/irradianceCore";
import { validateIrradianceRequest } from "../../../../shared/renewableEnergy/irradiance/irradianceValidation";

self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const request = validateIrradianceRequest(event.data);
    self.postMessage({
      type: "progress",
      generation: request.generation,
      percent: 1,
      stage: "Validating governed weather input",
    });
    const result = calculateIrradiance(
      request.weatherReview,
      request.configuration,
      (percent, stage) =>
        self.postMessage({ type: "progress", generation: request.generation, percent, stage }),
    );
    self.postMessage({ type: "success", generation: request.generation, result });
  } catch (error) {
    const generation =
      event.data &&
      typeof event.data === "object" &&
      "generation" in event.data &&
      Number.isSafeInteger(event.data.generation)
        ? event.data.generation
        : -1;
    self.postMessage({
      type: "error",
      generation,
      message: error instanceof Error ? error.message : "Irradiance calculation failed.",
    });
  }
};
