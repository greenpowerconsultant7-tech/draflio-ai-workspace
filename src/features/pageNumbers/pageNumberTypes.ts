export const PAGE_NUMBER_FORMATS = [
  "numeric",
  "zero-padded",
  "page-prefix",
  "page-of-total",
] as const;
export type PageNumberFormat = (typeof PAGE_NUMBER_FORMATS)[number];

export const PAGE_NUMBER_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type PageNumberPosition = (typeof PAGE_NUMBER_POSITIONS)[number];

export const PAGE_NUMBER_FONTS = ["Helvetica", "Times Roman", "Courier"] as const;
export type PageNumberFont = (typeof PAGE_NUMBER_FONTS)[number];

export type PageNumberOptions = {
  format: PageNumberFormat;
  startingNumber: number;
  pageMode: "all" | "custom";
  customRange: string;
  skipFirst: number;
  position: PageNumberPosition;
  font: PageNumberFont;
  bold: boolean;
  fontSize: number;
  margin: number;
  color: string;
};

export const DEFAULT_PAGE_NUMBER_OPTIONS: PageNumberOptions = {
  format: "numeric",
  startingNumber: 1,
  pageMode: "all",
  customRange: "",
  skipFirst: 0,
  position: "bottom-center",
  font: "Helvetica",
  bold: false,
  fontSize: 12,
  margin: 24,
  color: "#111111",
};

export type PageNumberResult = {
  blob: Blob;
  bytes: Uint8Array;
  filename: string;
  totalPages: number;
  numberedPages: number;
  options: PageNumberOptions;
};
