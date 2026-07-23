export type EngineeringStatus = "First module" | "Coming soon";

export type EngineeringDiscipline = {
  id:
    "electrical" | "mechanical" | "civil-structural" | "process" | "architectural" | "geotechnical";
  title: string;
  description: string;
  status: EngineeringStatus;
  plannedTools: readonly string[];
  route?: "/engineering/electrical";
  icon: "bolt" | "cog" | "building" | "workflow" | "ruler" | "mountain";
};

export const ENGINEERING_DISCIPLINES: readonly EngineeringDiscipline[] = [
  {
    id: "electrical",
    title: "Electrical Engineering",
    description:
      "Analyze single-line diagrams and substation drawings, extract equipment data, prepare BOQs, and review equipment ratings.",
    status: "First module",
    plannedTools: [
      "Smart SLD & Substation PDF Inspector",
      "Electrical BOQ Extractor",
      "Equipment Rating Review",
      "Substation Drawing Analyzer",
    ],
    route: "/engineering/electrical",
    icon: "bolt",
  },
  {
    id: "mechanical",
    title: "Mechanical Engineering",
    description:
      "Extract structured equipment, valve, piping, and instrument information from P&IDs and isometric drawings.",
    status: "Coming soon",
    plannedTools: [
      "P&ID Extractor",
      "Valve Schedule Generator",
      "Line List Extractor",
      "Instrument Index Generator",
    ],
    icon: "cog",
  },
  {
    id: "civil-structural",
    title: "Civil & Structural Engineering",
    description:
      "Extract rebar callouts, calculate steel quantities, and prepare bar bending schedules from structural drawings.",
    status: "Coming soon",
    plannedTools: ["Rebar BBS Generator", "Steel Tonnage Calculator", "Drawing Quantity Extractor"],
    icon: "building",
  },
  {
    id: "process",
    title: "Process Engineering",
    description:
      "Extract stream tables, process values, and structured data from process flow diagrams and engineering reports.",
    status: "Coming soon",
    plannedTools: ["PFD Stream Table Extractor", "Heat and Material Balance Extraction"],
    icon: "workflow",
  },
  {
    id: "architectural",
    title: "Architectural Engineering",
    description:
      "Measure floor areas and extract door, window, and finish schedules from architectural PDFs.",
    status: "Coming soon",
    plannedTools: [
      "Floorplan Area Takeoff",
      "Door and Window Schedule",
      "Finish Schedule Extractor",
    ],
    icon: "ruler",
  },
  {
    id: "geotechnical",
    title: "Geotechnical Engineering",
    description:
      "Convert repetitive borehole and soil investigation reports into structured project summaries.",
    status: "Coming soon",
    plannedTools: ["Borehole Log Extractor", "Soil Layer Summary", "SPT Data Extraction"],
    icon: "mountain",
  },
];
