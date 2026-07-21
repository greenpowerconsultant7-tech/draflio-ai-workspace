import {
  PDFDocument,
  type PDFImage,
  rgb,
  StandardFonts,
} from "pdf-lib";

export type SignatureMode =
  | "type"
  | "draw"
  | "upload";

export type SignaturePosition =
  | "top-left"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type SignatureScope =
  | {
      type: "first";
    }
  | {
      type: "all";
    }
  | {
      type: "selected";
      pages: number[];
    };

export type SignatureSettings = {
  mode: SignatureMode;
  typedText: string;
  drawnDataUrl: string | null;
  uploadedImage: File | null;
  fontSize: number;
  color: string;
  opacity: number;
  widthPercent: number;
  position: SignaturePosition;
  scope: SignatureScope;
};

type DrawPosition = {
  x: number;
  y: number;
};

function hexToRgb(hex: string) {
  const normalized = hex
    .replace("#", "")
    .trim();

  if (
    !/^[0-9a-fA-F]{6}$/.test(
      normalized
    )
  ) {
    return rgb(0, 0, 0);
  }

  const value = Number.parseInt(
    normalized,
    16
  );

  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  );
}

function calculatePosition(
  pageWidth: number,
  pageHeight: number,
  itemWidth: number,
  itemHeight: number,
  position: SignaturePosition
): DrawPosition {
  const padding = 36;

  const left = padding;

  const right = Math.max(
    padding,
    pageWidth - itemWidth - padding
  );

  const bottom = padding;

  const top = Math.max(
    padding,
    pageHeight - itemHeight - padding
  );

  const centerX = Math.max(
    padding,
    (pageWidth - itemWidth) / 2
  );

  const centerY = Math.max(
    padding,
    (pageHeight - itemHeight) / 2
  );

  switch (position) {
    case "top-left":
      return {
        x: left,
        y: top,
      };

    case "top-right":
      return {
        x: right,
        y: top,
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

function dataUrlToBytes(
  dataUrl: string
): Uint8Array {
  const base64 =
    dataUrl.split(",")[1];

  if (!base64) {
    throw new Error(
      "Invalid drawn signature."
    );
  }

  const binary = window.atob(base64);

  const bytes = new Uint8Array(
    binary.length
  );

  for (
    let index = 0;
    index < binary.length;
    index++
  ) {
    bytes[index] =
      binary.charCodeAt(index);
  }

  return bytes;
}

function resolvePageIndexes(
  pageCount: number,
  scope: SignatureScope
): number[] {
  if (scope.type === "first") {
    return pageCount > 0 ? [0] : [];
  }

  if (scope.type === "all") {
    return Array.from(
      {
        length: pageCount,
      },
      (_, index) => index
    );
  }

  return Array.from(
    new Set(
      scope.pages
        .map((page) => page - 1)
        .filter(
          (index) =>
            index >= 0 &&
            index < pageCount
        )
    )
  );
}

class SignService {
  async sign(
    file: File,
    settings: SignatureSettings
  ): Promise<Uint8Array> {
    const sourceBytes =
      await file.arrayBuffer();

    const pdf = await PDFDocument.load(
      sourceBytes
    );

    const pages = pdf.getPages();

    const pageIndexes =
      resolvePageIndexes(
        pages.length,
        settings.scope
      );

    if (pageIndexes.length === 0) {
      throw new Error(
        "No valid pages were selected."
      );
    }

    if (settings.mode === "type") {
      await this.addTypedSignature(
        pdf,
        settings,
        pageIndexes
      );
    } else {
      await this.addImageSignature(
        pdf,
        settings,
        pageIndexes
      );
    }

    return pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
  }

  private async addTypedSignature(
    pdf: PDFDocument,
    settings: SignatureSettings,
    pageIndexes: number[]
  ) {
    const text =
      settings.typedText.trim();

    if (!text) {
      throw new Error(
        "Enter a signature name."
      );
    }

    const font = await pdf.embedFont(
      StandardFonts.HelveticaOblique
    );

    const textWidth =
      font.widthOfTextAtSize(
        text,
        settings.fontSize
      );

    const textHeight =
      settings.fontSize;

    const color = hexToRgb(
      settings.color
    );

    const pages = pdf.getPages();

    for (const index of pageIndexes) {
      const page = pages[index];

      const {
        width,
        height,
      } = page.getSize();

      const position =
        calculatePosition(
          width,
          height,
          textWidth,
          textHeight,
          settings.position
        );

      page.drawText(text, {
        x: position.x,
        y: position.y,
        size: settings.fontSize,
        font,
        color,
        opacity: settings.opacity,
      });
    }
  }

  private async addImageSignature(
    pdf: PDFDocument,
    settings: SignatureSettings,
    pageIndexes: number[]
  ) {
    const image =
      await this.embedSignatureImage(
        pdf,
        settings
      );

    const pages = pdf.getPages();

    for (const index of pageIndexes) {
      const page = pages[index];

      const {
        width: pageWidth,
        height: pageHeight,
      } = page.getSize();

      let imageWidth =
        pageWidth *
        (settings.widthPercent / 100);

      let imageHeight =
        imageWidth *
        (image.height / image.width);

      const maximumHeight =
        pageHeight - 72;

      if (
        imageHeight > maximumHeight
      ) {
        imageHeight = maximumHeight;

        imageWidth =
          imageHeight *
          (image.width / image.height);
      }

      const position =
        calculatePosition(
          pageWidth,
          pageHeight,
          imageWidth,
          imageHeight,
          settings.position
        );

      page.drawImage(image, {
        x: position.x,
        y: position.y,
        width: imageWidth,
        height: imageHeight,
        opacity: settings.opacity,
      });
    }
  }

  private async embedSignatureImage(
    pdf: PDFDocument,
    settings: SignatureSettings
  ): Promise<PDFImage> {
    if (settings.mode === "draw") {
      if (!settings.drawnDataUrl) {
        throw new Error(
          "Draw a signature first."
        );
      }

      const bytes = dataUrlToBytes(
        settings.drawnDataUrl
      );

      return pdf.embedPng(bytes);
    }

    const imageFile =
      settings.uploadedImage;

    if (!imageFile) {
      throw new Error(
        "Select a signature image."
      );
    }

    const bytes =
      await imageFile.arrayBuffer();

    const filename =
      imageFile.name.toLowerCase();

    if (
      imageFile.type === "image/png" ||
      filename.endsWith(".png")
    ) {
      return pdf.embedPng(bytes);
    }

    if (
      imageFile.type === "image/jpeg" ||
      filename.endsWith(".jpg") ||
      filename.endsWith(".jpeg")
    ) {
      return pdf.embedJpg(bytes);
    }

    throw new Error(
      "Only PNG and JPG signature images are supported."
    );
  }
}

export const signService =
  new SignService();