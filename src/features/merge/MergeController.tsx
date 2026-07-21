import type { DraflioTool } from "@/lib/draflio-tools";
import MergeWorkspace from "./MergeWorkspace";

export default function MergeController({
  tool,
}: {
  tool: DraflioTool;
}) {
  return <MergeWorkspace />;
}