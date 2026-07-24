import { createFileRoute } from "@tanstack/react-router";
import { RenewableSectorPlaceholder } from "@/features/renewable-energy/RenewableSectorPlaceholder";
export const Route = createFileRoute("/renewable-energy/bess")({
  head: () => ({
    meta: [
      { title: "Battery Storage Engineering | Draflio" },
      {
        name: "description",
        content: "Explore the planned Draflio battery-storage engineering workspace.",
      },
    ],
  }),
  component: () => (
    <RenewableSectorPlaceholder
      title="Battery Storage"
      value="Prepare reviewable battery sizing, operating assumptions, lifecycle plans, and project records."
      categories={[
        "Capacity sizing",
        "Degradation",
        "Dispatch",
        "Augmentation",
        "Thermal and electrical assumptions",
        "Lifecycle reporting",
      ]}
    />
  ),
});
