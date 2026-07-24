import type { SolarFeature, SolarFeatureId } from "../renewableEnergyTypes";

const common = {
  inputs: [] as readonly string[],
  outputs: [] as readonly string[],
};

export const SOLAR_FEATURES = [
  {
    ...common,
    id: "terrain",
    title: "Terrain Intelligence",
    shortTitle: "Terrain",
    description:
      "Prepare terrain, contour, survey, and site-boundary information for a reviewed utility-scale solar project model.",
    status: "foundation",
    route: "/renewable-energy/solar/terrain",
    category: "Site",
    inputs: [
      "GeoTIFF elevation data",
      "XYZ or CSV elevation points",
      "DXF contour data",
      "KML or KMZ site boundaries",
      "Survey files",
      "Topographic drawings",
    ],
    outputs: [
      "Reviewed terrain mesh",
      "Contour model",
      "Slope and aspect analysis",
      "Buildable-area review",
      "Terrain source references",
    ],
    limitations: "Terrain reconstruction is not implemented in this phase.",
    architecturalRole:
      "Establishes traceable site and coordinate-system inputs for later layout work.",
    order: 1,
  },
  {
    ...common,
    id: "pdf-to-3d",
    title: "Drawing-to-Scene",
    shortTitle: "Drawing-to-Scene",
    description:
      "Convert verified geometry from solar layouts and engineering drawings into a reviewable three-dimensional project scene.",
    status: "foundation",
    route: "/renewable-energy/solar/pdf-to-3d",
    category: "Drawings",
    inputs: [
      "Vector PDFs",
      "Scanned PDFs",
      "DXF drawings",
      "Layout drawings",
      "Topographic plans",
      "Equipment layouts",
    ],
    outputs: [
      "Verified scene geometry",
      "Detected project objects",
      "Unresolved-geometry findings",
      "Object provenance",
      "Future glTF or CAD exports",
    ],
    limitations: "Automatic PDF-to-3D conversion is not implemented in this phase.",
    architecturalRole:
      "Defines how reviewed drawing geometry can retain source provenance in a future scene.",
    order: 2,
  },
  {
    ...common,
    id: "components",
    title: "Component Compatibility",
    shortTitle: "Components",
    description:
      "Import and validate module, inverter, battery, and equipment definitions into an open Draflio component model.",
    status: "foundation",
    route: "/renewable-energy/solar/components",
    category: "Equipment",
    inputs: [
      "PAN files",
      "OND files",
      "Manufacturer datasheet PDFs",
      "CSV templates",
      "JSON",
      "Manual entry",
    ],
    outputs: [
      "Versioned component record",
      "Validation warnings",
      "Source-format metadata",
      "Parameter comparison",
      "Review status",
    ],
    limitations: "Direct proprietary component-file parsing is not implemented in this phase.",
    architecturalRole:
      "Defines reviewable, source-linked equipment records for future calculations.",
    order: 3,
  },
  {
    ...common,
    id: "layout",
    title: "Solar Layout",
    shortTitle: "Layout",
    description:
      "Create terrain-aware array blocks, tables, rows, stringing regions, roads, and exclusion zones.",
    status: "planned",
    route: "/renewable-energy/solar/layout",
    category: "Design",
    inputs: ["Reviewed terrain", "Site boundaries", "Equipment definitions", "Design constraints"],
    outputs: ["Array layout", "Stringing regions", "Road and exclusion-zone records"],
    limitations: "Layout generation is not implemented in this phase.",
    architecturalRole: "Will connect reviewed site constraints with physical array configuration.",
    order: 4,
  },
  {
    ...common,
    id: "shading",
    title: "Shading Analysis",
    shortTitle: "Shading",
    description:
      "Review horizon, near-shading, terrain, row-to-row shading, and obstruction impacts.",
    status: "planned",
    route: "/renewable-energy/solar/shading",
    category: "Analysis",
    inputs: ["Terrain and horizon", "Reviewed layout", "Obstruction geometry"],
    outputs: ["Shading assumptions", "Review findings", "Source-linked study record"],
    limitations: "Shading calculations are not implemented in this phase.",
    architecturalRole: "Will preserve shading inputs and findings for simulation review.",
    order: 5,
  },
  {
    ...common,
    id: "simulation",
    title: "Solar Simulation",
    shortTitle: "Simulation",
    description:
      "Prepare a reproducible solar-energy simulation using reviewed weather, component, layout, electrical, and loss assumptions.",
    status: "research",
    route: "/renewable-energy/solar/simulation",
    category: "Analysis",
    inputs: ["Reviewed weather source", "Components", "Layout", "Electrical and loss assumptions"],
    outputs: ["Reproducible study record", "Assumption register", "Review findings"],
    limitations: "No energy-yield calculation is performed in this phase.",
    architecturalRole:
      "Defines provenance and review requirements for a future validated calculation engine.",
    order: 6,
  },
  {
    ...common,
    id: "pvsyst-inspector",
    title: "PVsyst Report Inspector",
    shortTitle: "PVsyst Inspector",
    description:
      "Extract and compare project assumptions, equipment, losses, performance ratio, specific yield, and energy results from PVsyst reports.",
    status: "planned",
    route: "/renewable-energy/solar/pvsyst-inspector",
    category: "Review",
    inputs: ["PVsyst reports", "Project assumptions", "Equipment references"],
    outputs: ["Assumption comparison", "Source references", "Review findings"],
    limitations: "PVsyst report extraction is not implemented in this phase.",
    architecturalRole: "Will connect third-party report evidence to reviewable project records.",
    order: 7,
  },
  {
    ...common,
    id: "revision-comparison",
    title: "Revision Comparison",
    shortTitle: "Revisions",
    description:
      "Compare project revisions across drawings, layouts, equipment, assumptions, energy results, findings, and BOQ records.",
    status: "planned",
    route: "/renewable-energy/solar/revision-comparison",
    category: "Review",
    inputs: ["Project revisions", "Drawings", "Equipment and assumption records"],
    outputs: ["Change register", "Comparison findings", "Review history"],
    limitations: "Renewable-energy revision comparison is not implemented in this phase.",
    architecturalRole: "Will make changes across shared project records traceable and reviewable.",
    order: 8,
  },
] as const satisfies readonly SolarFeature[];

export const SOLAR_FEATURE_IDS = SOLAR_FEATURES.map((feature) => feature.id);

export function isSolarFeatureId(value: string): value is SolarFeatureId {
  return SOLAR_FEATURE_IDS.some((id) => id === value);
}

export function getSolarFeature(value: string): SolarFeature | undefined {
  return isSolarFeatureId(value)
    ? SOLAR_FEATURES.find((feature) => feature.id === value)
    : undefined;
}
