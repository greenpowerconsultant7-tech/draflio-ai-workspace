import type { PageNumberFormat } from "./pageNumberTypes";

function padded(value: number, total: number) {
  const width = Math.max(2, String(Math.max(Math.abs(value), Math.abs(total))).length);
  const sign = value < 0 ? "-" : "";
  return `${sign}${String(Math.abs(value)).padStart(width, "0")}`;
}

export function formatPageNumber(
  sequenceNumber: number,
  totalNumberedPages: number,
  format: PageNumberFormat,
) {
  if (!Number.isInteger(sequenceNumber) || !Number.isInteger(totalNumberedPages)) {
    throw new Error("Invalid page-number value.");
  }
  if (format === "zero-padded") return padded(sequenceNumber, totalNumberedPages);
  if (format === "page-prefix") return `Page ${sequenceNumber}`;
  if (format === "page-of-total") return `Page ${sequenceNumber} of ${totalNumberedPages}`;
  return String(sequenceNumber);
}
