import { toolRegistry } from "./ToolRegistry";

export class ToolEngine {
  load(toolId: string) {
    return toolRegistry.get(toolId);
  }

  exists(toolId: string) {
    return toolRegistry.exists(toolId);
  }

  list() {
    return toolRegistry.getAll();
  }
}

export const toolEngine = new ToolEngine();