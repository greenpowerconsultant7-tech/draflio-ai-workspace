import {
  degrees,
  PDFDocument,
} from "pdf-lib";

export type RotationAngle =
  | 90
  | 180
  | 270;

export type RotationScope =
  | {
      type: "all";
    }
  | {
      type: "selected";
      pages: number[];
    };

class RotateService {
  async rotate(
    file: File,
    angle: RotationAngle,
    scope: RotationScope
  ): Promise<Uint8Array> {
    const bytes =
      await file.arrayBuffer();

    const pdf =
      await PDFDocument.load(bytes);

    const pages = pdf.getPages();

    const selectedPageIndexes =
      scope.type === "selected"
        ? new Set(
            scope.pages
              .map((page) => page - 1)
              .filter(
                (pageIndex) =>
                  pageIndex >= 0 &&
                  pageIndex < pages.length
              )
          )
        : null;

    pages.forEach((page, index) => {
      const shouldRotate =
        scope.type === "all" ||
        selectedPageIndexes?.has(index);

      if (!shouldRotate) {
        return;
      }

      const currentAngle =
        page.getRotation().angle;

      const nextAngle =
        (currentAngle + angle) % 360;

      page.setRotation(
        degrees(nextAngle)
      );
    });

    return pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
  }
}

export const rotateService =
  new RotateService();