import {
  PageSizes,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";

import type {
  InvoiceData,
  InvoiceParty,
  PreparedInvoice,
} from "./invoiceTypes";

const [PAGE_WIDTH, PAGE_HEIGHT] =
  PageSizes.A4;

const MARGIN = 48;
const BOTTOM_MARGIN = 55;

const COLORS = {
  primary: rgb(
    37 / 255,
    99 / 255,
    235 / 255
  ),

  dark: rgb(
    15 / 255,
    23 / 255,
    42 / 255
  ),

  text: rgb(
    30 / 255,
    41 / 255,
    59 / 255
  ),

  muted: rgb(
    100 / 255,
    116 / 255,
    139 / 255
  ),

  border: rgb(
    203 / 255,
    213 / 255,
    225 / 255
  ),

  light: rgb(
    241 / 255,
    245 / 255,
    249 / 255
  ),

  white: rgb(1, 1, 1),
};

type InvoiceFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

function roundMoney(
  value: number
) {
  return Math.round(
    (value + Number.EPSILON) *
      100
  ) / 100;
}

function safeText(
  value: string
) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, "?");
}

function formatMoney(
  amount: number,
  currency: string
) {
  try {
    return safeText(
      new Intl.NumberFormat(
        "en-US",
        {
          style: "currency",
          currency,
          currencyDisplay: "code",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      ).format(amount)
    );
  } catch {
    return `${currency} ${amount.toFixed(
      2
    )}`;
  }
}

function formatQuantity(
  quantity: number
) {
  if (
    Number.isInteger(quantity)
  ) {
    return quantity.toString();
  }

  return quantity
    .toFixed(2)
    .replace(/\.?0+$/, "");
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maximumWidth: number
): string[] {
  const cleanedText =
    safeText(text).trim();

  if (!cleanedText) {
    return [""];
  }

  const words =
    cleanedText.split(/\s+/);

  const lines: string[] = [];

  let currentLine = "";

  for (const word of words) {
    const testLine =
      currentLine
        ? `${currentLine} ${word}`
        : word;

    const testWidth =
      font.widthOfTextAtSize(
        testLine,
        fontSize
      );

    if (
      testWidth <= maximumWidth
    ) {
      currentLine = testLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    /*
      Handle a single word that is wider
      than the available column.
    */
    if (
      font.widthOfTextAtSize(
        word,
        fontSize
      ) > maximumWidth
    ) {
      let partialWord = "";

      for (const character of word) {
        const nextWord =
          partialWord + character;

        if (
          font.widthOfTextAtSize(
            nextWord,
            fontSize
          ) <= maximumWidth
        ) {
          partialWord = nextWord;
        } else {
          if (partialWord) {
            lines.push(
              partialWord
            );
          }

          partialWord =
            character;
        }
      }

      currentLine =
        partialWord;
    } else {
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawRightAlignedText(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLORS.text
) {
  const safeValue =
    safeText(text);

  const width =
    font.widthOfTextAtSize(
      safeValue,
      size
    );

  page.drawText(
    safeValue,
    {
      x: rightX - width,
      y,
      font,
      size,
      color,
    }
  );
}

function drawPartyBox(
  page: PDFPage,
  title: string,
  party: InvoiceParty,
  x: number,
  y: number,
  width: number,
  fonts: InvoiceFonts
) {
  const height = 116;

  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderColor:
      COLORS.border,
    borderWidth: 1,
    color: COLORS.white,
  });

  page.drawText(
    safeText(title),
    {
      x: x + 14,
      y: y - 22,
      font: fonts.bold,
      size: 9,
      color:
        COLORS.primary,
    }
  );

  page.drawText(
    safeText(party.name),
    {
      x: x + 14,
      y: y - 42,
      font: fonts.bold,
      size: 11,
      color: COLORS.dark,
    }
  );

  let lineY = y - 59;

  const details: string[] = [];

  if (party.address) {
    details.push(
      party.address
    );
  }

  if (party.email) {
    details.push(
      party.email
    );
  }

  if (party.phone) {
    details.push(
      party.phone
    );
  }

  if (party.taxId) {
    details.push(
      `Tax ID: ${party.taxId}`
    );
  }

  for (const detail of details) {
    const lines = wrapText(
      detail,
      fonts.regular,
      8.5,
      width - 28
    );

    for (const line of lines) {
      if (
        lineY <
        y - height + 10
      ) {
        return;
      }

      page.drawText(
        line,
        {
          x: x + 14,
          y: lineY,
          font:
            fonts.regular,
          size: 8.5,
          color:
            COLORS.muted,
        }
      );

      lineY -= 11;
    }
  }
}

function drawDocumentHeader(
  page: PDFPage,
  invoice: PreparedInvoice,
  fonts: InvoiceFonts
) {
  page.drawText(
    safeText(
      invoice.seller.name
    ),
    {
      x: MARGIN,
      y: PAGE_HEIGHT - 62,
      font: fonts.bold,
      size: 16,
      color: COLORS.dark,
    }
  );

  page.drawText(
    "INVOICE",
    {
      x:
        PAGE_WIDTH -
        MARGIN -
        118,

      y: PAGE_HEIGHT - 65,
      font: fonts.bold,
      size: 28,
      color:
        COLORS.primary,
    }
  );

  const labelX =
    PAGE_WIDTH - MARGIN - 190;

  const valueRightX =
    PAGE_WIDTH - MARGIN;

  let y =
    PAGE_HEIGHT - 94;

  const information = [
    [
      "Invoice number",
      invoice.invoiceNumber,
    ],

    [
      "Invoice date",
      invoice.invoiceDate,
    ],

    [
      "Due date",
      invoice.dueDate ?? "-",
    ],
  ];

  for (
    const [label, value]
    of information
  ) {
    page.drawText(
      label,
      {
        x: labelX,
        y,
        font:
          fonts.regular,
        size: 8.5,
        color:
          COLORS.muted,
      }
    );

    drawRightAlignedText(
      page,
      value,
      valueRightX,
      y,
      fonts.bold,
      8.5,
      COLORS.text
    );

    y -= 15;
  }

  page.drawLine({
    start: {
      x: MARGIN,
      y: PAGE_HEIGHT - 142,
    },

    end: {
      x:
        PAGE_WIDTH -
        MARGIN,
      y: PAGE_HEIGHT - 142,
    },

    thickness: 1.5,
    color:
      COLORS.primary,
  });

  const partyGap = 16;

  const partyWidth =
    (
      PAGE_WIDTH -
      MARGIN * 2 -
      partyGap
    ) / 2;

  const partyTop =
    PAGE_HEIGHT - 166;

  drawPartyBox(
    page,
    "FROM",
    invoice.seller,
    MARGIN,
    partyTop,
    partyWidth,
    fonts
  );

  drawPartyBox(
    page,
    "BILL TO",
    invoice.customer,
    MARGIN +
      partyWidth +
      partyGap,
    partyTop,
    partyWidth,
    fonts
  );

  return (
    partyTop -
    116 -
    28
  );
}

function drawContinuationHeader(
  page: PDFPage,
  invoice: PreparedInvoice,
  fonts: InvoiceFonts
) {
  page.drawText(
    safeText(
      invoice.seller.name
    ),
    {
      x: MARGIN,
      y: PAGE_HEIGHT - 55,
      font: fonts.bold,
      size: 14,
      color: COLORS.dark,
    }
  );

  drawRightAlignedText(
    page,
    `Invoice ${invoice.invoiceNumber}`,
    PAGE_WIDTH - MARGIN,
    PAGE_HEIGHT - 55,
    fonts.bold,
    11,
    COLORS.primary
  );

  page.drawLine({
    start: {
      x: MARGIN,
      y: PAGE_HEIGHT - 72,
    },

    end: {
      x:
        PAGE_WIDTH -
        MARGIN,
      y: PAGE_HEIGHT - 72,
    },

    thickness: 1,
    color:
      COLORS.border,
  });

  return PAGE_HEIGHT - 96;
}

function drawTableHeader(
  page: PDFPage,
  y: number,
  fonts: InvoiceFonts
) {
  const tableWidth =
    PAGE_WIDTH - MARGIN * 2;

  const height = 27;

  page.drawRectangle({
    x: MARGIN,
    y: y - height,
    width: tableWidth,
    height,
    color:
      COLORS.primary,
  });

  page.drawText(
    "DESCRIPTION",
    {
      x: MARGIN + 10,
      y: y - 18,
      font: fonts.bold,
      size: 8.5,
      color: COLORS.white,
    }
  );

  drawRightAlignedText(
    page,
    "QTY",
    MARGIN + 330,
    y - 18,
    fonts.bold,
    8.5,
    COLORS.white
  );

  drawRightAlignedText(
    page,
    "UNIT PRICE",
    MARGIN + 425,
    y - 18,
    fonts.bold,
    8.5,
    COLORS.white
  );

  drawRightAlignedText(
    page,
    "TOTAL",
    PAGE_WIDTH -
      MARGIN -
      10,
    y - 18,
    fonts.bold,
    8.5,
    COLORS.white
  );

  return y - height;
}

function drawInvoiceRow(
  page: PDFPage,
  invoice: PreparedInvoice,
  itemIndex: number,
  y: number,
  rowHeight: number,
  descriptionLines: string[],
  fonts: InvoiceFonts
) {
  const item =
    invoice.items[itemIndex];

  const tableWidth =
    PAGE_WIDTH - MARGIN * 2;

  const backgroundColor =
    itemIndex % 2 === 0
      ? COLORS.white
      : COLORS.light;

  page.drawRectangle({
    x: MARGIN,
    y: y - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color:
      backgroundColor,
    borderColor:
      COLORS.border,
    borderWidth: 0.5,
  });

  let descriptionY =
    y - 17;

  for (
    const line of
    descriptionLines
  ) {
    page.drawText(
      line,
      {
        x: MARGIN + 10,
        y: descriptionY,
        font:
          fonts.regular,
        size: 8.5,
        color:
          COLORS.text,
      }
    );

    descriptionY -= 11;
  }

  const valueY =
    y - 17;

  drawRightAlignedText(
    page,
    formatQuantity(
      item.quantity
    ),
    MARGIN + 330,
    valueY,
    fonts.regular,
    8.5
  );

  drawRightAlignedText(
    page,
    formatMoney(
      item.unitPrice,
      invoice.currency
    ),
    MARGIN + 425,
    valueY,
    fonts.regular,
    8.5
  );

  drawRightAlignedText(
    page,
    formatMoney(
      item.total,
      invoice.currency
    ),
    PAGE_WIDTH -
      MARGIN -
      10,
    valueY,
    fonts.bold,
    8.5
  );
}

function drawTotals(
  page: PDFPage,
  invoice: PreparedInvoice,
  y: number,
  fonts: InvoiceFonts
) {
  const boxWidth = 230;

  const boxX =
    PAGE_WIDTH -
    MARGIN -
    boxWidth;

  const rows = [
    [
      "Subtotal",
      formatMoney(
        invoice.totals
          .subtotal,
        invoice.currency
      ),
    ],

    [
      "Discount",
      formatMoney(
        invoice.totals
          .discount,
        invoice.currency
      ),
    ],

    [
      `Tax (${invoice.taxRate ?? 0}%)`,
      formatMoney(
        invoice.totals.tax,
        invoice.currency
      ),
    ],
  ];

  const rowHeight = 23;

  let currentY = y;

  for (
    const [label, value]
    of rows
  ) {
    page.drawText(
      label,
      {
        x: boxX,
        y: currentY - 16,
        font:
          fonts.regular,
        size: 9,
        color:
          COLORS.muted,
      }
    );

    drawRightAlignedText(
      page,
      value,
      PAGE_WIDTH - MARGIN,
      currentY - 16,
      fonts.bold,
      9
    );

    currentY -=
      rowHeight;
  }

  page.drawRectangle({
    x: boxX - 10,
    y: currentY - 33,
    width:
      boxWidth + 10,
    height: 33,
    color:
      COLORS.primary,
  });

  page.drawText(
    "TOTAL",
    {
      x: boxX,
      y: currentY - 22,
      font: fonts.bold,
      size: 11,
      color: COLORS.white,
    }
  );

  drawRightAlignedText(
    page,
    formatMoney(
      invoice.totals
        .grandTotal,
      invoice.currency
    ),
    PAGE_WIDTH -
      MARGIN -
      10,
    currentY - 22,
    fonts.bold,
    11,
    COLORS.white
  );

  return currentY - 48;
}

function drawOptionalTextSection(
  page: PDFPage,
  title: string,
  value: string,
  y: number,
  fonts: InvoiceFonts
) {
  page.drawText(
    title,
    {
      x: MARGIN,
      y,
      font: fonts.bold,
      size: 9,
      color:
        COLORS.primary,
    }
  );

  const lines = wrapText(
    value,
    fonts.regular,
    8.5,
    PAGE_WIDTH -
      MARGIN * 2
  );

  let currentY =
    y - 15;

  for (const line of lines) {
    page.drawText(
      line,
      {
        x: MARGIN,
        y: currentY,
        font:
          fonts.regular,
        size: 8.5,
        color:
          COLORS.text,
      }
    );

    currentY -= 11;
  }

  return currentY - 10;
}

export function prepareInvoice(
  invoice: InvoiceData
): PreparedInvoice {
  const calculatedItems =
    invoice.items.map(
      (item) => ({
        ...item,

        total:
          roundMoney(
            item.quantity *
              item.unitPrice
          ),
      })
    );

  const subtotal =
    roundMoney(
      calculatedItems.reduce(
        (
          runningTotal,
          item
        ) =>
          runningTotal +
          item.total,
        0
      )
    );

  const requestedDiscount =
    invoice.discount ?? 0;

  const discount =
    roundMoney(
      Math.min(
        requestedDiscount,
        subtotal
      )
    );

  const taxableAmount =
    roundMoney(
      Math.max(
        0,
        subtotal - discount
      )
    );

  const taxRate =
    invoice.taxRate ?? 0;

  const tax =
    roundMoney(
      taxableAmount *
        (taxRate / 100)
    );

  const grandTotal =
    roundMoney(
      taxableAmount + tax
    );

  return {
    ...invoice,

    items:
      calculatedItems,

    totals: {
      subtotal,
      discount,
      taxableAmount,
      tax,
      grandTotal,
    },
  };
}

export async function generateInvoicePdf(
  invoiceData: InvoiceData
): Promise<Buffer> {
  const invoice =
    prepareInvoice(
      invoiceData
    );

  const pdf =
    await PDFDocument.create();

  const fonts: InvoiceFonts = {
    regular:
      await pdf.embedFont(
        StandardFonts.Helvetica
      ),

    bold:
      await pdf.embedFont(
        StandardFonts.HelveticaBold
      ),
  };

  pdf.setTitle(
    safeText(
      `Invoice ${invoice.invoiceNumber}`
    )
  );

  pdf.setAuthor(
    safeText(
      invoice.seller.name
    )
  );

  pdf.setSubject(
    "Invoice"
  );

  pdf.setCreator(
    "Draflio Invoice API"
  );

  pdf.setProducer(
    "Draflio"
  );

  pdf.setCreationDate(
    new Date()
  );

  let page =
    pdf.addPage(
      PageSizes.A4
    );

  let y =
    drawDocumentHeader(
      page,
      invoice,
      fonts
    );

  y = drawTableHeader(
    page,
    y,
    fonts
  );

  for (
    let itemIndex = 0;
    itemIndex <
    invoice.items.length;
    itemIndex++
  ) {
    const item =
      invoice.items[
        itemIndex
      ];

    const descriptionLines =
      wrapText(
        item.description,
        fonts.regular,
        8.5,
        245
      );

    const rowHeight =
      Math.max(
        30,
        descriptionLines.length *
          11 +
          14
      );

    if (
      y - rowHeight <
      BOTTOM_MARGIN + 145
    ) {
      page =
        pdf.addPage(
          PageSizes.A4
        );

      y =
        drawContinuationHeader(
          page,
          invoice,
          fonts
        );

      y =
        drawTableHeader(
          page,
          y,
          fonts
        );
    }

    drawInvoiceRow(
      page,
      invoice,
      itemIndex,
      y,
      rowHeight,
      descriptionLines,
      fonts
    );

    y -= rowHeight;
  }

  if (
    y <
    BOTTOM_MARGIN + 175
  ) {
    page =
      pdf.addPage(
        PageSizes.A4
      );

    y =
      drawContinuationHeader(
        page,
        invoice,
        fonts
      );
  } else {
    y -= 24;
  }

  y = drawTotals(
    page,
    invoice,
    y,
    fonts
  );

  if (
    invoice.paymentTerms
  ) {
    if (
      y < BOTTOM_MARGIN + 75
    ) {
      page =
        pdf.addPage(
          PageSizes.A4
        );

      y =
        drawContinuationHeader(
          page,
          invoice,
          fonts
        );
    }

    y =
      drawOptionalTextSection(
        page,
        "PAYMENT TERMS",
        invoice.paymentTerms,
        y,
        fonts
      );
  }

  if (invoice.notes) {
    if (
      y < BOTTOM_MARGIN + 75
    ) {
      page =
        pdf.addPage(
          PageSizes.A4
        );

      y =
        drawContinuationHeader(
          page,
          invoice,
          fonts
        );
    }

    drawOptionalTextSection(
      page,
      "NOTES",
      invoice.notes,
      y,
      fonts
    );
  }

  const pages =
    pdf.getPages();

  pages.forEach(
    (
      invoicePage,
      pageIndex
    ) => {
      invoicePage.drawLine({
        start: {
          x: MARGIN,
          y: 38,
        },

        end: {
          x:
            PAGE_WIDTH -
            MARGIN,
          y: 38,
        },

        thickness: 0.5,
        color:
          COLORS.border,
      });

      invoicePage.drawText(
        "Generated by Draflio",
        {
          x: MARGIN,
          y: 23,
          font:
            fonts.regular,
          size: 7.5,
          color:
            COLORS.muted,
        }
      );

      drawRightAlignedText(
        invoicePage,
        `Page ${pageIndex + 1} of ${pages.length}`,
        PAGE_WIDTH - MARGIN,
        23,
        fonts.regular,
        7.5,
        COLORS.muted
      );
    }
  );

  const pdfBytes =
    await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });

  return Buffer.from(
    pdfBytes
  );
}