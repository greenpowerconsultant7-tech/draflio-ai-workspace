import { createFileRoute, notFound } from "@tanstack/react-router";
import { SolarFeatureDetail } from "@/features/renewable-energy/solar/SolarFeatureDetail";
import { getSolarFeature } from "@/features/renewable-energy/solar/solarFeatureCatalog";
import { TerrainWorkspace } from "@/features/renewable-energy/terrain/TerrainWorkspace";
import { DrawingSceneWorkspace } from "@/features/renewable-energy/drawing/DrawingSceneWorkspace";

const titles: Record<string, string> = {
  terrain: "Terrain Intelligence | Draflio",
  "pdf-to-3d": "Drawing-to-Scene | Draflio",
  components: "Component Compatibility | Draflio",
  layout: "Solar Layout | Draflio",
  shading: "Solar Shading Analysis | Draflio",
  simulation: "Solar Simulation | Draflio",
  "pvsyst-inspector": "PVsyst Report Inspector | Draflio",
  "revision-comparison": "Solar Revision Comparison | Draflio",
};

export const Route = createFileRoute("/renewable-energy/solar/$featureId")({
  loader: ({ params }) => {
    const feature = getSolarFeature(params.featureId);
    if (!feature) throw notFound();
    return { feature };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? titles[loaderData.feature.id] : "Solar PV Engineering | Draflio" },
      {
        name: "description",
        content: loaderData?.feature.description ?? "Draflio Solar PV engineering workspace.",
      },
    ],
  }),
  component: FeatureRoute,
});

function FeatureRoute() {
  const { feature } = Route.useLoaderData();
  if (feature.id === "pdf-to-3d") return <DrawingSceneWorkspace />;
  if (feature.id === "terrain") return <TerrainWorkspace />;
  return <SolarFeatureDetail feature={feature} />;
}
