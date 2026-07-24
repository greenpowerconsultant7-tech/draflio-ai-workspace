import { createFileRoute } from "@tanstack/react-router";
import { SolarLanding } from "@/features/renewable-energy/solar/SolarLanding";

export const Route = createFileRoute("/renewable-energy/solar/")({
  head: () => ({
    meta: [
      { title: "Solar PV Engineering | Draflio" },
      {
        name: "description",
        content:
          "Prepare terrain, drawings, component data, layouts, shading studies, simulations, and project audits within one solar engineering workspace.",
      },
    ],
  }),
  component: SolarLanding,
});
