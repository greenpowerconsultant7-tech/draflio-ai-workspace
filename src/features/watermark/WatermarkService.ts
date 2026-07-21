import {
  degrees,
  PDFDocument,
  type PDFImage,
  rgb,
  StandardFonts,
} from "pdf-lib";

export type WatermarkType = "text" | "image";

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type WatermarkSettings = {
  type: WatermarkType;
  text: string;
  imageFile: File | null;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  position: WatermarkPosition;
  imageScale: number;
};

type Position = {
  x: number;
  y: number;
};

function hexToRgb(hex: string) {
  let normalized = hex.replace("#", "").trim();

  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((character) => character + character)
      .join("");
  }

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return rgb(0.5, 0.5, 0.5);
  }

  const value = Number.parseInt(normalized, 16);

  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return rgb(
    red / 255,
    green / 255,
    blue / 255
  );
}

function calculatePosition(
  pageWidth: number,
  pageHeight: number,
  itemWidth: number,
  itemHeight: number,
  position: WatermarkPosition
): Position {
  const padding = 30;

  const left = padding;
  const centerX = (pageWidth - itemWidth) / 2;
  const right = pageWidth - itemWidth - padding;

  const bottom = padding;
  const centerY = (pageHeight - itemHeight) / 2;
  const top = pageHeight - itemHeight - padding;

  switch (position) {
    case "top-left":
      return { x: left, y: top };

    case "top-center":
      return { x: centerX, y: top };

    case "top-right":
      return { x: right, y: top };

    case "center-left":
      return { x: left, y: centerY };

    case "center-right":
      return { x: right, y: centerY };

    case "bottom-left":
      return { x: left, y: bottom };

    case "bottom-center":
      return { x: centerX, y: bottom };

    case "bottom-right":
      return { x: right, y: bottom };

    case "center":
    default:
      return {
        x: centerX,
        y: centerY,
      };
  }
}

class WatermarkService {
  async addWatermark(
    file: File,
    settings: WatermarkSettings
  ): Promise<Uint8Array> {
    const sourceBytes = await file.arrayBuffer();

    const pdf = await PDFDocument.load(
      sourceBytes
    );

    if (settings.type === "text") {
      await this.addTextWatermark(
        pdf,
        settings
      );
    } else {
      await this.addImageWatermark(
        pdf,
        settings
      );
    }

    return pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
  }

  private async addTextWatermark(
    pdf: PDFDocument,
    settings: WatermarkSettings
  ) {
    const font = await pdf.embedFont(
      StandardFonts.HelveticaBold
    );

    const text = settings.text.trim();

    const textWidth =
      font.widthOfTextAtSize(
        text,
        settings.fontSize
      );

    const textHeight = settings.fontSize;

    const color = hexToRgb(
      settings.color
    );

    for (const page of pdf.getPages()) {
      const { width, height } =
        page.getSize();

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
        rotate: degrees(
          settings.rotation
        ),
      });
    }
  }

  private async addImageWatermark(
    pdf: PDFDocument,
    settings: WatermarkSettings
  ) {
    if (!settings.imageFile) {
      throw new Error(
        "No watermark image selected."
      );
    }

    const imageBytes =
      await settings.imageFile.arrayBuffer();

    const filename =
      settings.imageFile.name.toLowerCase();

    const mimeType =
      settings.imageFile.type;

    let image: PDFImage;

    if (
      mimeType === "image/png" ||
      filename.endsWith(".png")
    ) {
      image = await pdf.embedPng(
        imageBytes
      );
    } else if (
      mimeType === "image/jpeg" ||
      filename.endsWith(".jpg") ||
      filename.endsWith(".jpeg")
    ) {
      image = await pdf.embedJpg(
        imageBytes
      );
    } else {
      throw new Error(
        "Only PNG and JPG watermark images are supported."
      );
    }

    const imageRatio =
      image.height / image.width;

    for (const page of pdf.getPages()) {
      const { width, height } =
        page.getSize();

      const imageWidth =
        width *
        (settings.imageScale / 100);

      const imageHeight =
        imageWidth * imageRatio;

      const position =
        calculatePosition(
          width,
          height,
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
        rotate: degrees(
          settings.rotation
        ),
      });
    }
  }
}

export const watermarkService =
  new WatermarkService();