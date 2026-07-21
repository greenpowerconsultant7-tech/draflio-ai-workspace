import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";

import type {
  ValidatedWatermarkRequest,
  WatermarkApiOptions,
  WatermarkPosition,
} from "./watermarkTypes";

type Point = {
  x: number;
  y: number;
};

function safeText(
  value: string
) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function hexToRgb(
  hex: string
) {
  const normalized =
    hex.replace("#", "");

  const value =
    Number.parseInt(
      normalized,
      16
    );

  return rgb(
    ((value >> 16) & 255) /
      255,

    ((value >> 8) & 255) /
      255,

    (value & 255) /
      255
  );
}

function fitFontSize(
  text: string,
  font: PDFFont,
  requestedSize: number,
  maximumWidth: number
) {
  let fontSize =
    requestedSize;

  while (
    fontSize > 8 &&
    font.widthOfTextAtSize(
      text,
      fontSize
    ) > maximumWidth
  ) {
    fontSize -= 1;
  }

  return fontSize;
}

function calculatePosition(
  pageWidth: number,
  pageHeight: number,
  itemWidth: number,
  itemHeight: number,
  position: WatermarkPosition
): Point {
  const padding = 32;

  const left =
    padding;

  const centerX =
    Math.max(
      padding,
      (
        pageWidth -
        itemWidth
      ) / 2
    );

  const right =
    Math.max(
      padding,
      pageWidth -
        itemWidth -
        padding
    );

  const bottom =
    padding;

  const centerY =
    Math.max(
      padding,
      (
        pageHeight -
        itemHeight
      ) / 2
    );

  const top =
    Math.max(
      padding,
      pageHeight -
        itemHeight -
        padding
    );

  switch (position) {
    case "top-left":
      return {
        x: left,
        y: top,
      };

    case "top-center":
      return {
        x: centerX,
        y: top,
      };

    case "top-right":
      return {
        x: right,
        y: top,
      };

    case "center-left":
      return {
        x: left,
        y: centerY,
      };

    case "center-right":
      return {
        x: right,
        y: centerY,
      };

    case "bottom-left":
      return {
        x: left,
        y: bottom,
      };

    case "bottom-center":
      return {
        x: centerX,
        y: bottom,
      };

    case "bottom-right":
      return {
        x: right,
        y: bottom,
      };

    case "center":
    default:
      return {
        x: centerX,
        y: centerY,
      };
  }
}

function resolvePageIndexes(
  pageCount: number,
  options: WatermarkApiOptions
) {
  if (
    options.scope.type ===
    "all"
  ) {
    return Array.from(
      {
        length: pageCount,
      },
      (_, index) => index
    );
  }

  const indexes =
    Array.from(
      new Set(
        options.scope.pages
          .map(
            (pageNumber) =>
              pageNumber - 1
          )
          .filter(
            (index) =>
              index >= 0 &&
              index < pageCount
          )
      )
    );

  if (
    indexes.length === 0
  ) {
    throw new Error(
      "None of the selected page numbers exist in this PDF."
    );
  }

  return indexes;
}

function drawSingleWatermark(
  page: PDFPage,
  font: PDFFont,
  options: WatermarkApiOptions
) {
  const {
    width: pageWidth,
    height: pageHeight,
  } = page.getSize();

  const text =
    safeText(
      options.text
    );

  const lines =
    text
      .split(/\r?\n/)
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  const safeLines =
    lines.length > 0
      ? lines
      : [text];

  const longestLine =
    safeLines.reduce(
      (
        longest,
        current
      ) =>
        current.length >
        longest.length
          ? current
          : longest,
      safeLines[0]
    );

  const maximumWidth =
    Math.max(
      100,
      pageWidth - 64
    );

  const fontSize =
    fitFontSize(
      longestLine,
      font,
      options.fontSize,
      maximumWidth
    );

  const lineHeight =
    fontSize * 1.2;

  const textWidth =
    Math.max(
      ...safeLines.map(
        (line) =>
          font.widthOfTextAtSize(
            line,
            fontSize
          )
      )
    );

  const textHeight =
    safeLines.length *
    lineHeight;

  const position =
    calculatePosition(
      pageWidth,
      pageHeight,
      textWidth,
      textHeight,
      options.position
    );

  safeLines.forEach(
    (line, index) => {
      const lineWidth =
        font.widthOfTextAtSize(
          line,
          fontSize
        );

      const centeredX =
        position.x +
        (
          textWidth -
          lineWidth
        ) / 2;

      const lineY =
        position.y +
        textHeight -
        lineHeight *
          (index + 1);

      page.drawText(
        line,
        {
          x: centeredX,
          y: lineY,

          font,
          size:
            fontSize,

          color:
            hexToRgb(
              options.color
            ),

          opacity:
            options.opacity,

          rotate:
            degrees(
              options.rotation
            ),
        }
      );
    }
  );
}

function drawRepeatedWatermark(
  page: PDFPage,
  font: PDFFont,
  options: WatermarkApiOptions
) {
  const {
    width: pageWidth,
    height: pageHeight,
  } = page.getSize();

  const text =
    safeText(
      options.text
    )
      .replace(/\r?\n/g, " ")
      .trim();

  const maximumWidth =
    Math.max(
      100,
      pageWidth * 0.7
    );

  const fontSize =
    fitFontSize(
      text,
      font,
      options.fontSize,
      maximumWidth
    );

  const textWidth =
    font.widthOfTextAtSize(
      text,
      fontSize
    );

  const horizontalStep =
    Math.max(
      textWidth +
        options.horizontalGap,
      80
    );

  const verticalStep =
    Math.max(
      fontSize +
        options.verticalGap,
      60
    );

  const startX =
    -pageWidth;

  const endX =
    pageWidth * 2;

  const startY =
    -pageHeight;

  const endY =
    pageHeight * 2;

  let rowIndex = 0;

  for (
    let y = startY;
    y <= endY;
    y += verticalStep
  ) {
    const rowOffset =
      rowIndex % 2 === 0
        ? 0
        : horizontalStep / 2;

    for (
      let x =
        startX -
        rowOffset;

      x <= endX;

      x += horizontalStep
    ) {
      page.drawText(
        text,
        {
          x,
          y,

          font,
          size:
            fontSize,

          color:
            hexToRgb(
              options.color
            ),

          opacity:
            options.opacity,

          rotate:
            degrees(
              options.rotation
            ),
        }
      );
    }

    rowIndex += 1;
  }
}

export async function generateWatermarkedPdf(
  inputBuffer: Buffer,
  request:
    ValidatedWatermarkRequest
): Promise<Buffer> {
  let pdf: PDFDocument;

  try {
    pdf =
      await PDFDocument.load(
        inputBuffer
      );
  } catch {
    throw new Error(
      "The uploaded file is not a readable PDF or is password protected."
    );
  }

  const font =
    await pdf.embedFont(
      StandardFonts.HelveticaBold
    );

  const pages =
    pdf.getPages();

  if (
    pages.length === 0
  ) {
    throw new Error(
      "The PDF contains no pages."
    );
  }

  const pageIndexes =
    resolvePageIndexes(
      pages.length,
      request.options
    );

  for (
    const pageIndex of
    pageIndexes
  ) {
    const page =
      pages[pageIndex];

    if (
      request.options.mode ===
      "repeated"
    ) {
      drawRepeatedWatermark(
        page,
        font,
        request.options
      );
    } else {
      drawSingleWatermark(
        page,
        font,
        request.options
      );
    }
  }

  pdf.setProducer(
    "Draflio Watermark API"
  );

  pdf.setCreator(
    "Draflio"
  );

  pdf.setModificationDate(
    new Date()
  );

  const outputBytes =
    await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances:
        false,
    });

  return Buffer.from(
    outputBytes
  );
}