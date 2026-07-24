import type { RenewableSector } from "./renewableEnergyTypes";

export const RENEWABLE_SECTORS = [
  {
    id: "solar",
    title: "Solar PV",
    status: "Active development",
    description:
      "Build a verified solar project model from terrain, drawings, electrical equipment, and engineering assumptions.",
    route: "/renewable-energy/solar",
  },
  {
    id: "wind",
    title: "Wind Energy",
    status: "Planned",
    description:
      "Prepare terrain-aware turbine layouts, wake-analysis inputs, energy models, and engineering review packages.",
    route: "/renewable-energy/wind",
  },
  {
    id: "bess",
    title: "Battery Storage",
    status: "Planned",
    description:
      "Prepare battery sizing, degradation, dispatch, augmentation, and lifecycle-analysis projects.",
    route: "/renewable-energy/bess",
  },
  {
    id: "hybrid",
    title: "Hybrid & Microgrids",
    status: "Planned",
    description:
      "Coordinate solar, wind, battery storage, loads, and grid limits within a shared project model.",
    route: "/renewable-energy/hybrid",
  },
] as const satisfies readonly RenewableSector[];
