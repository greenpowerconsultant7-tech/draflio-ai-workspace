import { SCENE_LIMITS } from "../../../../shared/renewableEnergy/draflioSceneTypes";

export type JsonFileCheck = { valid: true } | { valid: false; message: string };

export function validateSceneJsonFile(file: Pick<File, "name" | "size" | "type">): JsonFileCheck {
  if (!file.name.toLowerCase().endsWith(".json"))
    return { valid: false, message: "Choose a file with a .json extension." };
  if (file.size === 0) return { valid: false, message: "The selected JSON file is empty." };
  if (file.size > SCENE_LIMITS.maxJsonBytes)
    return { valid: false, message: "The selected JSON file exceeds the 10 MB limit." };
  if (file.type && !["application/json", "text/json", "text/plain"].includes(file.type))
    return {
      valid: false,
      message: "The selected file does not have a supported JSON media type.",
    };
  return { valid: true };
}

export function paginate<T>(items: readonly T[], page: number, pageSize = 100) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  return {
    items: items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    page: safePage,
    pageCount,
  };
}
