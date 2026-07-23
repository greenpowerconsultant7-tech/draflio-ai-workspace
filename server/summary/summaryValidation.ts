import { ApiError } from "../errors/apiError.js";
import {
  DEFAULT_SUMMARY_OPTIONS,
  type SummaryMode,
  type SummaryOptions,
} from "../../shared/summaryTypes.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set<SummaryMode>(["brief", "detailed", "page-by-page"]);
const OPTION_KEYS = new Set([
  "mode",
  "includeKeyPoints",
  "includePossibleActionItems",
  "includePageSummaries",
]);

export function validateSummaryId(value: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_SUMMARY_SESSION_ID",
      message: "The summary session ID is invalid.",
    });
  }
  return value;
}

export function parseSummaryOptions(value: unknown): SummaryOptions {
  if (value === undefined) return { ...DEFAULT_SUMMARY_OPTIONS };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest();
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !OPTION_KEYS.has(key))) throw invalidRequest();
  const mode = input.mode ?? DEFAULT_SUMMARY_OPTIONS.mode;
  if (typeof mode !== "string" || !MODES.has(mode as SummaryMode)) throw invalidRequest();
  const booleanOption = (key: keyof Omit<SummaryOptions, "mode">) => {
    const option = input[key];
    if (option === undefined) return DEFAULT_SUMMARY_OPTIONS[key];
    if (typeof option !== "boolean") throw invalidRequest();
    return option;
  };
  return {
    mode: mode as SummaryMode,
    includeKeyPoints: booleanOption("includeKeyPoints"),
    includePossibleActionItems: booleanOption("includePossibleActionItems"),
    includePageSummaries:
      mode === "page-by-page" ? true : booleanOption("includePageSummaries"),
  };
}

function invalidRequest() {
  return new ApiError({
    statusCode: 400,
    code: "INVALID_SUMMARY_REQUEST",
    message: "The summary request is invalid.",
  });
}
