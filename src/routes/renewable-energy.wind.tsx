import { createFileRoute } from "@tanstack/react-router";
import { RenewableSectorPlaceholder } from "@/features/renewable-energy/RenewableSectorPlaceholder";
export const Route = createFileRoute("/renewable-energy/wind")({
  head: () => ({
    meta: [
      { title: "Wind Energy Engineering | Draflio" },
      {
        name: "description",
        content: "Explore the planned Draflio wind-energy engineering workspace.",
      },
    ],
  }),
  component: () => (
    <RenewableSectorPlaceholder
      title="Wind Energy"
      value="Prepare terrain-aware turbine projects with traceable layout, wake, energy, electrical, and review assumptions."
      categories={[
        "Site and terrain",
        "Turbine layout",
        "Wake modelling",
        "Energy assessment",
        "Electrical collection",
        "Project review",
      ]}
    />
  ),
});
