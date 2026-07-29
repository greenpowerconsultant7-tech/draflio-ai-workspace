export type RenewableSectorId = "solar" | "wind" | "bess" | "hybrid";
export type RenewableFeatureStatus = "foundation" | "planned" | "research";
export type SolarFeatureId =
  | "terrain"
  | "pdf-to-3d"
  | "components"
  | "layout"
  | "shading"
  | "weather"
  | "irradiance"
  | "simulation"
  | "pvsyst-inspector"
  | "revision-comparison";

export interface RenewableSector {
  id: RenewableSectorId;
  title: string;
  status: "Active development" | "Planned";
  description: string;
  route: `/renewable-energy/${RenewableSectorId}`;
}

export interface SolarFeature {
  id: SolarFeatureId;
  title: string;
  shortTitle: string;
  description: string;
  status: RenewableFeatureStatus;
  route: `/renewable-energy/solar/${SolarFeatureId}`;
  category: string;
  inputs: readonly string[];
  outputs: readonly string[];
  limitations: string;
  architecturalRole: string;
  order: number;
}
