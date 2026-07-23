export class PageRangeError extends Error {
  constructor() {
    super("Enter a valid page range.");
    this.name = "PageRangeError";
  }
}

const MAX_RANGE_TOKENS = 1_000;

export function parsePageRange(input: string, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 500) {
    throw new PageRangeError();
  }
  const trimmed = input.trim();
  if (!trimmed) throw new PageRangeError();
  const tokens = trimmed.split(",");
  if (tokens.length > MAX_RANGE_TOKENS) throw new PageRangeError();
  const pages = new Set<number>();

  for (const rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) throw new PageRangeError();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!match) throw new PageRangeError();
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end > pageCount ||
      end - start + 1 > pageCount
    ) {
      throw new PageRangeError();
    }
    for (let page = start; page <= end; page += 1) pages.add(page - 1);
  }

  return [...pages].sort((left, right) => left - right);
}

export function resolveNumberedPages(
  pageCount: number,
  mode: "all" | "custom",
  customRange: string,
  skipFirst: number,
): number[] {
  if (!Number.isInteger(skipFirst) || skipFirst < 0 || skipFirst > pageCount) {
    throw new PageRangeError();
  }
  const selected =
    mode === "all"
      ? Array.from({ length: pageCount }, (_, index) => index)
      : parsePageRange(customRange, pageCount);
  return selected.filter((index) => index >= skipFirst);
}
