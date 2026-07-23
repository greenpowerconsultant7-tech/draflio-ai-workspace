import type { PageNumberPosition } from "./pageNumberTypes";

export type PageNumberPlacement = {
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
};

export function getPageNumberPlacement(
  width: number,
  height: number,
  rotation: number,
  position: PageNumberPosition,
  margin: number,
  textWidth: number,
  textHeight: number,
): PageNumberPlacement {
  const normalized = ((rotation % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized)) {
    throw new Error("Unsupported page rotation.");
  }
  if (
    ![width, height, margin, textWidth, textHeight].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    margin < 0 ||
    textWidth <= 0 ||
    textHeight <= 0
  ) {
    throw new Error("The selected margin or font size does not fit on the page.");
  }

  const visibleWidth = normalized % 180 === 0 ? width : height;
  const visibleHeight = normalized % 180 === 0 ? height : width;
  const horizontal = position.split("-")[1];
  const vertical = position.startsWith("top") ? "top" : "bottom";
  const visibleX =
    horizontal === "left"
      ? margin
      : horizontal === "right"
        ? visibleWidth - margin - textWidth
        : (visibleWidth - textWidth) / 2;
  const visibleY =
    vertical === "bottom" ? margin : visibleHeight - margin - textHeight;

  if (
    visibleX < 0 ||
    visibleY < 0 ||
    visibleX + textWidth > visibleWidth ||
    visibleY + textHeight > visibleHeight
  ) {
    throw new Error("The selected margin or font size does not fit on the page.");
  }

  // pdf-lib coordinates use the unrotated page box. Map visible coordinates back
  // without changing the source page rotation.
  if (normalized === 90) {
    return { x: visibleY, y: height - visibleX, rotation: 270 };
  }
  if (normalized === 180) {
    return {
      x: width - visibleX,
      y: height - visibleY,
      rotation: 180,
    };
  }
  if (normalized === 270) {
    return { x: width - visibleY, y: visibleX, rotation: 90 };
  }
  return { x: visibleX, y: visibleY, rotation: 0 };
}
