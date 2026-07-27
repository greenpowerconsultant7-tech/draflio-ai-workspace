import { TERRAIN_LIMITS } from "../../../../shared/renewableEnergy/terrain/terrainTypes";

export function validateTerrainFile(file: Pick<File, "name" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["csv", "txt", "xyz"].includes(extension))
    return { valid: false as const, message: "Choose a CSV, TXT, or XYZ terrain-point file." };
  if (file.size === 0)
    return { valid: false as const, message: "The selected terrain file is empty." };
  if (file.size > TERRAIN_LIMITS.maxFileBytes)
    return { valid: false as const, message: "The selected terrain file exceeds the 25 MB limit." };
  return { valid: true as const };
}

export function safeTerrainFilename(sourceName: string) {
  const base = sourceName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "terrain"}-terrain-scene.json`;
}
