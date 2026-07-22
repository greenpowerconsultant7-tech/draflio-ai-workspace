import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  MAXIMUM_REDACTION_RECTANGLES,
  clampNormalizedRectangle,
  rectanglesOverlap,
  type EditorRectangle,
  type NormalizedRectangle,
} from "./redactionGeometry";

export type DetectionCategory = "email" | "phone" | "payment-card" | "ipv4" | "date" | "custom";

export interface DetectionOptions {
  email: boolean;
  phone: boolean;
  paymentCard: boolean;
  ipv4: boolean;
  date: boolean;
  customPhrase: string;
}

export interface RedactionSuggestion extends EditorRectangle {
  category: DetectionCategory;
  selected: boolean;
}

export interface DetectedRange {
  category: DetectionCategory;
  start: number;
  end: number;
}

export interface DetectionProgress {
  currentPage: number;
  totalPages: number;
}

export interface DetectionResult {
  suggestions: RedactionSuggestion[];
  searchableTextItems: number;
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

interface ViewportLike {
  width: number;
  height: number;
  scale: number;
  transform: number[];
}

interface TextSpan {
  item: TextItemLike;
  start: number;
  end: number;
}

function separatorBetween(previous: TextItemLike | undefined, current: TextItemLike): string {
  if (!previous) return "";
  if (previous.hasEOL) return "\n";
  const previousHeight = Math.max(Math.abs(previous.height), 1);
  const currentHeight = Math.max(Math.abs(current.height), 1);
  const lineTolerance = Math.max(previousHeight, currentHeight) * 0.5;
  if (Math.abs(current.transform[5] - previous.transform[5]) > lineTolerance) return "\n";
  const previousEnd = previous.transform[4] + previous.width;
  const visualGap = current.transform[4] - previousEnd;
  return visualGap <= Math.max(previousHeight, currentHeight) * 0.25 ? "" : " ";
}

const EMAIL_PATTERN = /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}(?![A-Z0-9_-])/giu;
const CARD_PATTERN = /(?<!\d)\d(?:[ -]?\d){12,18}(?![ -]?\d)/gu;
const IPV4_PATTERN = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/gu;
const PHONE_PATTERN = /(?<![\w])(?:\+?\d[\d().\t -]{5,}\d)(?![\w])/gu;
const NUMERIC_DATE_PATTERN = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/gu;
const MONTH_DATE_PATTERN =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)\d{4}\b/giu;

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Redaction detection was cancelled.", "AbortError");
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidLuhnCard(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d(?:[ -]?\d){12,18}$/.test(trimmed)) return false;
  const number = digits(trimmed);
  if (number.length < 13 || number.length > 19 || /^(\d)\1+$/.test(number)) return false;
  let total = 0;
  let doubleDigit = false;
  for (let index = number.length - 1; index >= 0; index -= 1) {
    let digit = Number(number[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
    doubleDigit = !doubleDigit;
  }
  return total % 10 === 0;
}

export function isValidEmailCandidate(value: string): boolean {
  const [local, domain, ...extra] = value.split("@");
  if (!local || !domain || extra.length > 0 || local.length > 64 || value.length > 254)
    return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )
  );
}

export function isValidIPv4(value: string): boolean {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255)
  );
}

export function isValidPhoneCandidate(value: string): boolean {
  const trimmed = value.trim();
  if (
    !/^\+?[\d().\t -]+$/.test(trimmed) ||
    /\+/.test(trimmed.slice(1)) ||
    /[().-]{2}|[\t ]{2,}/.test(trimmed) ||
    (trimmed.match(/\(/g)?.length ?? 0) !== (trimmed.match(/\)/g)?.length ?? 0) ||
    isValidIPv4(trimmed) ||
    isValidDateCandidate(trimmed)
  )
    return false;
  const number = digits(trimmed);
  if (number.length < 7 || number.length > 15 || /^(\d)\1+$/.test(number)) return false;
  if (number.length >= 13 && isValidLuhnCard(trimmed)) return false;
  return /[()+.\t -]/.test(trimmed) || trimmed.startsWith("+");
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const maximumDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= maximumDay;
}

export function isValidDateCandidate(value: string): boolean {
  const trimmed = value.trim();
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (iso) return validCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    return validCalendarDate(year, second, first) || validCalendarDate(year, first, second);
  }
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const named = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(\d{4})$/i.exec(trimmed);
  if (!named) return false;
  const normalizedMonth = named[1].toLowerCase();
  const monthIndex = monthNames.findIndex(
    (month) => month === normalizedMonth || month.startsWith(normalizedMonth),
  );
  return monthIndex >= 0 && validCalendarDate(Number(named[3]), monthIndex + 1, Number(named[2]));
}

function addPatternMatches(
  output: DetectedRange[],
  text: string,
  pattern: RegExp,
  category: DetectionCategory,
  validator?: (value: string) => boolean,
): void {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[0] || (validator && !validator(match[0]))) continue;
    output.push({ category, start: match.index, end: match.index + match[0].length });
  }
}

function rangesOverlap(left: DetectedRange, right: DetectedRange): boolean {
  return left.start < right.end && right.start < left.end;
}

export function detectSensitiveRanges(text: string, options: DetectionOptions): DetectedRange[] {
  const ranges: DetectedRange[] = [];
  if (options.email) addPatternMatches(ranges, text, EMAIL_PATTERN, "email", isValidEmailCandidate);
  if (options.paymentCard)
    addPatternMatches(ranges, text, CARD_PATTERN, "payment-card", isValidLuhnCard);
  if (options.ipv4) addPatternMatches(ranges, text, IPV4_PATTERN, "ipv4", isValidIPv4);
  if (options.date) {
    addPatternMatches(ranges, text, NUMERIC_DATE_PATTERN, "date", isValidDateCandidate);
    addPatternMatches(ranges, text, MONTH_DATE_PATTERN, "date", isValidDateCandidate);
  }
  const phrase = options.customPhrase.trim();
  if (phrase) {
    const lowerText = text.toLocaleLowerCase("en-US");
    const lowerPhrase = phrase.toLocaleLowerCase("en-US");
    let start = lowerText.indexOf(lowerPhrase);
    while (start >= 0) {
      ranges.push({ category: "custom", start, end: start + phrase.length });
      start = lowerText.indexOf(lowerPhrase, start + Math.max(1, phrase.length));
    }
  }
  if (options.phone) {
    const phoneRanges: DetectedRange[] = [];
    addPatternMatches(phoneRanges, text, PHONE_PATTERN, "phone", isValidPhoneCandidate);
    ranges.push(
      ...phoneRanges.filter((phone) => !ranges.some((range) => rangesOverlap(phone, range))),
    );
  }
  return ranges
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter(
      (range, index, values) =>
        !values
          .slice(0, index)
          .some(
            (existing) =>
              existing.category === range.category &&
              existing.start === range.start &&
              existing.end === range.end,
          ),
    );
}

function multiplyMatrices(left: number[], right: number[]): number[] {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

export function textItemToNormalizedRectangle(
  item: TextItemLike,
  viewport: ViewportLike,
  startRatio = 0,
  endRatio = 1,
  padding = 0.003,
): NormalizedRectangle | null {
  if (!item.str || item.transform.length < 6 || viewport.transform.length < 6) return null;
  const transform = multiplyMatrices(viewport.transform, item.transform);
  const baselineLength = Math.hypot(transform[0], transform[1]);
  const height = Math.max(Math.hypot(transform[2], transform[3]), item.height * viewport.scale);
  const width = item.width * viewport.scale;
  if (![baselineLength, height, width, viewport.width, viewport.height].every(Number.isFinite))
    return null;
  if (
    baselineLength <= 0 ||
    height <= 0 ||
    width <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return null;
  const unitX = transform[0] / baselineLength;
  const unitY = transform[1] / baselineLength;
  const from = clampNormalizedRectangle({
    x: startRatio,
    y: 0,
    width: endRatio - startRatio,
    height: 1,
  });
  if (!from) return null;
  const baselineStart = {
    x: transform[4] + unitX * width * from.x,
    y: transform[5] + unitY * width * from.x,
  };
  const segmentWidth = width * from.width;
  const topOffset = { x: unitY * height, y: -unitX * height };
  const points = [
    baselineStart,
    { x: baselineStart.x + unitX * segmentWidth, y: baselineStart.y + unitY * segmentWidth },
    { x: baselineStart.x + topOffset.x, y: baselineStart.y + topOffset.y },
    {
      x: baselineStart.x + unitX * segmentWidth + topOffset.x,
      y: baselineStart.y + unitY * segmentWidth + topOffset.y,
    },
  ];
  const left = Math.min(...points.map((point) => point.x)) / viewport.width - padding;
  const top = Math.min(...points.map((point) => point.y)) / viewport.height - padding;
  const right = Math.max(...points.map((point) => point.x)) / viewport.width + padding;
  const bottom = Math.max(...points.map((point) => point.y)) / viewport.height + padding;
  return clampNormalizedRectangle({ x: left, y: top, width: right - left, height: bottom - top });
}

function unionRectangles(rectangles: NormalizedRectangle[]): NormalizedRectangle | null {
  if (rectangles.length === 0) return null;
  const left = Math.min(...rectangles.map((rectangle) => rectangle.x));
  const top = Math.min(...rectangles.map((rectangle) => rectangle.y));
  const right = Math.max(...rectangles.map((rectangle) => rectangle.x + rectangle.width));
  const bottom = Math.max(...rectangles.map((rectangle) => rectangle.y + rectangle.height));
  return clampNormalizedRectangle({ x: left, y: top, width: right - left, height: bottom - top });
}

function isTextItem(value: unknown): value is TextItemLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TextItemLike>;
  return (
    typeof candidate.str === "string" &&
    Array.isArray(candidate.transform) &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
}

export function detectPageSuggestions(
  items: readonly unknown[],
  viewport: ViewportLike,
  pageIndex: number,
  options: DetectionOptions,
  padding = 0.003,
): { suggestions: RedactionSuggestion[]; searchableTextItems: number } {
  const spans: TextSpan[] = [];
  const suggestions: RedactionSuggestion[] = [];
  let pageText = "";
  let previousItem: TextItemLike | undefined;
  let searchableTextItems = 0;
  for (const rawItem of items) {
    if (!isTextItem(rawItem) || !rawItem.str.trim()) continue;
    pageText += separatorBetween(previousItem, rawItem);
    const start = pageText.length;
    pageText += rawItem.str;
    spans.push({ item: rawItem, start, end: pageText.length });
    previousItem = rawItem;
    searchableTextItems += 1;
  }
  for (const range of detectSensitiveRanges(pageText, options)) {
    const fragments: NormalizedRectangle[] = [];
    for (const span of spans) {
      const overlapStart = Math.max(range.start, span.start);
      const overlapEnd = Math.min(range.end, span.end);
      if (overlapStart >= overlapEnd || span.item.str.length === 0) continue;
      const rectangle = textItemToNormalizedRectangle(
        span.item,
        viewport,
        (overlapStart - span.start) / span.item.str.length,
        (overlapEnd - span.start) / span.item.str.length,
        padding,
      );
      if (rectangle) fragments.push(rectangle);
    }
    const rectangle = unionRectangles(fragments);
    if (!rectangle) continue;
    suggestions.push({
      id: crypto.randomUUID(),
      category: range.category,
      pageIndex,
      ...rectangle,
      selected: true,
    });
  }
  pageText = "";
  spans.length = 0;
  previousItem = undefined;
  return { suggestions, searchableTextItems };
}

export function deduplicateSuggestions(
  suggestions: RedactionSuggestion[],
  manualRectangles: EditorRectangle[],
): RedactionSuggestion[] {
  const output: RedactionSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (manualRectangles.some((rectangle) => rectanglesOverlap(suggestion, rectangle))) continue;
    if (
      output.some(
        (existing) =>
          existing.pageIndex === suggestion.pageIndex &&
          rectanglesOverlap(existing, suggestion, 0.8),
      )
    )
      continue;
    output.push(suggestion);
  }
  return output;
}

export function limitAcceptedSuggestions(
  existingRectangleCount: number,
  suggestions: RedactionSuggestion[],
): { accepted: RedactionSuggestion[]; rejectedCount: number } {
  const available = Math.max(0, MAXIMUM_REDACTION_RECTANGLES - existingRectangleCount);
  return {
    accepted: suggestions.slice(0, available),
    rejectedCount: Math.max(0, suggestions.length - available),
  };
}

export async function scanRedactionSuggestions(
  document: PDFDocumentProxy,
  options: DetectionOptions,
  manualRectangles: EditorRectangle[],
  configuration: {
    signal?: AbortSignal;
    padding?: number;
    onProgress?: (progress: DetectionProgress) => void;
  } = {},
): Promise<DetectionResult> {
  const suggestions: RedactionSuggestion[] = [];
  let searchableTextItems = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    abortIfRequested(configuration.signal);
    configuration.onProgress?.({ currentPage: pageNumber, totalPages: document.numPages });
    const page = await document.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      abortIfRequested(configuration.signal);
      const pageResult = detectPageSuggestions(
        content.items,
        viewport,
        pageNumber - 1,
        options,
        configuration.padding,
      );
      suggestions.push(...pageResult.suggestions);
      searchableTextItems += pageResult.searchableTextItems;
      content.items.length = 0;
    } finally {
      page.cleanup();
    }
  }
  abortIfRequested(configuration.signal);
  return {
    suggestions: deduplicateSuggestions(suggestions, manualRectangles),
    searchableTextItems,
  };
}
