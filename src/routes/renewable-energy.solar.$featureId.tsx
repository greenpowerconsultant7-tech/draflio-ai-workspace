import { createFileRoute, notFound } from "@tanstack/react-router";
import { SolarFeatureDetail } from "@/features/renewable-energy/solar/SolarFeatureDetail";
import { getSolarFeature } from "@/features/renewable-energy/solar/solarFeatureCatalog";
import { TerrainWorkspace } from "@/features/renewable-energy/terrain/TerrainWorkspace";
import { DrawingSceneWorkspace } from "@/features/renewable-energy/drawing/DrawingSceneWorkspace";
import { ComponentWorkspace } from "@/features/renewable-energy/components/ComponentWorkspace";
import { LayoutWorkspace } from "@/features/renewable-energy/layout/LayoutWorkspace";
import { ShadingWorkspace } from "@/features/renewable-energy/shading/ShadingWorkspace";

const titles: Record<string, string> = {
  terrain: "Terrain Intelligence | Draflio",
  "pdf-to-3d": "Drawing-to-Scene | Draflio",
  components: "PV Module and Inverter Component Intelligence | Draflio",
  layout: "Terrain-Aware Solar Layout | Draflio",
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
  if (feature.id === "components") return <ComponentWorkspace />;
  if (feature.id === "layout") return <LayoutWorkspace />;
  if (feature.id === "shading") return <ShadingWorkspace />;
  return <SolarFeatureDetail feature={feature} />;
}
