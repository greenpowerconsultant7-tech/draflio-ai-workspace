export type HtmlPdfPageFormat =
  | "A4"
  | "Letter"
  | "Legal";

export type HtmlPdfOrientation =
  | "portrait"
  | "landscape";

export type HtmlPdfMargin = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export type HtmlPdfOptions = {
  format: HtmlPdfPageFormat;
  orientation: HtmlPdfOrientation;

  margin: HtmlPdfMargin;

  printBackground: boolean;

  headerHtml?: string;
  footerHtml?: string;

  displayHeaderFooter: boolean;

  preferCssPageSize: boolean;

  scale: number;
};

export type HtmlPdfRequest = {
  html: string;
  css?: string;

  filename?: string;

  options: HtmlPdfOptions;
};

export type ValidatedHtmlPdfRequest = {
  html: string;
  css: string;

  filename: string;

  options: HtmlPdfOptions;
};