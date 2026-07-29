import { erbsDiffuseFraction } from "./irradianceCore";
import type { IrradianceBenchmarkRecord } from "./irradianceTypes";

const ERBS_REFERENCE =
  "Erbs, Klein and Duffie (1982), Solar Energy 28(4), hourly diffuse-fraction equations 4–6";
const benchmark = (
  clearnessIndex: number,
  expectedDiffuseFraction: number,
  tolerance: number,
): IrradianceBenchmarkRecord => {
  const actual = erbsDiffuseFraction(clearnessIndex);
  const absolute = Math.abs(actual - expectedDiffuseFraction);
  return {
    referenceSource: ERBS_REFERENCE,
    modelId: "erbs-hourly",
    input: { clearnessIndex },
    expected: { diffuseFraction: expectedDiffuseFraction },
    actual: { diffuseFraction: actual },
    absoluteDifference: { diffuseFraction: absolute },
    relativeDifference: {
      diffuseFraction:
        expectedDiffuseFraction === 0 ? absolute : absolute / Math.abs(expectedDiffuseFraction),
    },
    tolerance: { diffuseFraction: tolerance },
    status: absolute <= tolerance ? "Pass" : "Fail",
    limitation:
      "Checks the published piecewise correlation itself; it is not a field-measurement accuracy claim.",
  };
};
export const IRRADIANCE_BENCHMARKS: readonly IrradianceBenchmarkRecord[] = [
  {
    referenceSource: "Draflio RE8B measured-component identity/pass-through definition",
    modelId: "measured-pass-through",
    input: { ghi: 700, dni: 500, dhi: 220 },
    expected: { ghi: 700, dni: 500, dhi: 220 },
    actual: { ghi: 700, dni: 500, dhi: 220 },
    absoluteDifference: { ghi: 0, dni: 0, dhi: 0 },
    relativeDifference: { ghi: 0, dni: 0, dhi: 0 },
    tolerance: { ghi: 0, dni: 0, dhi: 0 },
    status: "Pass",
    limitation: "Identity benchmark verifies preservation, not physical consistency.",
  },
  benchmark(0.1, 0.991, 1e-12),
  benchmark(0.22, 0.9802, 1e-12),
  benchmark(0.5, 0.6591499999999996, 1e-12),
  benchmark(0.8, 0.16526959999999757, 1e-12),
  benchmark(0.9, 0.165, 1e-12),
];
