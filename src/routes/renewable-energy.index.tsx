import { createFileRoute } from "@tanstack/react-router";
import { RenewableEnergyLanding } from "@/features/renewable-energy/RenewableEnergyLanding";

export const Route = createFileRoute("/renewable-energy/")({
  head: () => ({
    meta: [
      { title: "Renewable Energy Engineering | Draflio" },
      {
        name: "description",
        content:
          "Explore Draflio workspaces for solar PV, wind energy, battery storage, and hybrid renewable-energy projects.",
      },
    ],
  }),
  component: RenewableEnergyLanding,
});
