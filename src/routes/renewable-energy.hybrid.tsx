import { createFileRoute } from "@tanstack/react-router";
import { RenewableSectorPlaceholder } from "@/features/renewable-energy/RenewableSectorPlaceholder";
export const Route = createFileRoute("/renewable-energy/hybrid")({
  head: () => ({
    meta: [
      { title: "Hybrid & Microgrids | Draflio" },
      {
        name: "description",
        content: "Explore the planned Draflio hybrid renewable-energy and microgrid workspace.",
      },
    ],
  }),
  component: () => (
    <RenewableSectorPlaceholder
      title="Hybrid & Microgrids"
      value="Coordinate generation, storage, loads, and grid constraints within one reviewable future project model."
      categories={[
        "Solar",
        "Wind",
        "Storage",
        "Load",
        "Point-of-interconnection limits",
        "Coordinated dispatch",
        "Curtailment analysis",
      ]}
    />
  ),
});
