import type { DraflioTool } from "@/lib/draflio-tools";

export type ToolComponent = () => JSX.Element;

export interface RegisteredTool {
  tool: DraflioTool;
  component?: ToolComponent;
}

class ToolRegistry {
  private registry = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool) {
    this.registry.set(tool.tool.id, tool);
  }

  get(id: string) {
    return this.registry.get(id);
  }

  getAll() {
    return Array.from(this.registry.values());
  }

  exists(id: string) {
    return this.registry.has(id);
  }
}

export const toolRegistry = new ToolRegistry();