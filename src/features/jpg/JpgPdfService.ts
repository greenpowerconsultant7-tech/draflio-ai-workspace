import {
  PDFDocument,
  PageSizes,
  type PDFImage,
} from "pdf-lib";

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type JpgPdfMode =
  | "images-to-pdf"
  | "pdf-to-jpg";

export type ImagePageSize =
  | "auto"
  | "a4"
  | "letter";

export type ImageOrientation =
  | "auto"
  | "portrait"
  | "landscape";

export type ImageFit =
  | "contain"
  | "cover";

export type ImagesToPdfOptions = {
  pageSize: ImagePageSize;
  orientation: ImageOrientation;
  fit: ImageFit;
  margin: number;
};

export type PdfToJpgOptions = {
  quality: number;
  scale: number;
};

export type ConvertedJpgPage = {
  pageNumber: number;
  filename: string;
  bytes: Uint8Array;
  width: number;
  height: number;
};

type PageDimensions = {
  width: number;
  height: number;
};

type DrawDimensions = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isJpeg(file: File) {
  const filename =
    file.name.toLowerCase();

  return (
    file.type === "image/jpeg" ||
    filename.endsWith(".jpg") ||
    filename.endsWith(".jpeg")
  );
}

function isPng(file: File) {
  const filename =
    file.name.toLowerCase();

  return (
    file.type === "image/png" ||
    filename.endsWith(".png")
  );
}

function createOutputName(
  originalName: string,
  pageNumber: number
) {
  const baseName =
    originalName.replace(
      /\.pdf$/i,
      ""
    );

  return `${baseName}-page-${pageNumber}.jpg`;
}

function getPageDimensions(
  image: PDFImage,
  options: ImagesToPdfOptions
): PageDimensions {
  const margin = Math.max(
    0,
    options.margin
  );

  let width: number;
  let height: number;

  if (options.pageSize === "a4") {
    [width, height] =
      PageSizes.A4;
  } else if (
    options.pageSize === "letter"
  ) {
    [width, height] =
      PageSizes.Letter;
  } else {
    /*
      Convert image pixels approximately
      to PDF points using 96 DPI → 72 DPI.
    */
    width =
      image.width * 0.75 +
      margin * 2;

    height =
      image.height * 0.75 +
      margin * 2;
  }

  const imageIsLandscape =
    image.width > image.height;

  const shouldUseLandscape =
    options.orientation ===
      "landscape" ||
    (options.orientation ===
      "auto" &&
      imageIsLandscape);

  const shouldUsePortrait =
    options.orientation ===
      "portrait" ||
    (options.orientation ===
      "auto" &&
      !imageIsLandscape);

  if (
    shouldUseLandscape &&
    height > width
  ) {
    return {
      width: height,
      height: width,
    };
  }

  if (
    shouldUsePortrait &&
    width > height
  ) {
    return {
      width: height,
      height: width,
    };
  }

  return {
    width,
    height,
  };
}

function getDrawDimensions(
  image: PDFImage,
  pageWidth: number,
  pageHeight: number,
  options: ImagesToPdfOptions
): DrawDimensions {
  const margin = Math.max(
    0,
    options.margin
  );

  const availableWidth =
    Math.max(
      1,
      pageWidth - margin * 2
    );

  const availableHeight =
    Math.max(
      1,
      pageHeight - margin * 2
    );

  const widthScale =
    availableWidth /
    image.width;

  const heightScale =
    availableHeight /
    image.height;

  const scale =
    options.fit === "cover"
      ? Math.max(
          widthScale,
          heightScale
        )
      : Math.min(
          widthScale,
          heightScale
        );

  const width =
    image.width * scale;

  const height =
    image.height * scale;

  return {
    width,
    height,

    x:
      margin +
      (availableWidth - width) /
        2,

    y:
      margin +
      (availableHeight - height) /
        2,
  };
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(
                "The PDF page could not be converted to JPG."
              )
            );

            return;
          }

          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    }
  );
}

class JpgPdfService {
  async imagesToPdf(
    files: File[],
    options: ImagesToPdfOptions
  ): Promise<Uint8Array> {
    if (files.length === 0) {
      throw new Error(
        "Select at least one image."
      );
    }

    const pdf =
      await PDFDocument.create();

    for (const file of files) {
      const fileBytes =
        await file.arrayBuffer();

      let image: PDFImage;

      if (isJpeg(file)) {
        image =
          await pdf.embedJpg(
            fileBytes
          );
      } else if (isPng(file)) {
        image =
          await pdf.embedPng(
            fileBytes
          );
      } else {
        throw new Error(
          `${file.name} is not a supported JPG or PNG image.`
        );
      }

      const pageDimensions =
        getPageDimensions(
          image,
          options
        );

      const page = pdf.addPage([
        pageDimensions.width,
        pageDimensions.height,
      ]);

      const drawDimensions =
        getDrawDimensions(
          image,
          pageDimensions.width,
          pageDimensions.height,
          options
        );

      page.drawImage(image, {
        x: drawDimensions.x,
        y: drawDimensions.y,
        width: drawDimensions.width,
        height: drawDimensions.height,
      });
    }

    return pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
  }

  async pdfToJpg(
    file: File,
    options: PdfToJpgOptions
  ): Promise<ConvertedJpgPage[]> {
    const {
      getDocument,
      GlobalWorkerOptions,
    } = await import("pdfjs-dist");

    /*
      Vite converts the PDF.js worker file into
      a browser-accessible URL.
    */
    GlobalWorkerOptions.workerSrc =
      pdfWorkerUrl;

    const isPdf =
      file.type ===
        "application/pdf" ||
      file.name
        .toLowerCase()
        .endsWith(".pdf");

    if (!isPdf) {
      throw new Error(
        "Select a PDF file."
      );
    }

    const scale = Math.min(
      4,
      Math.max(
        0.5,
        options.scale
      )
    );

    const quality = Math.min(
      1,
      Math.max(
        0.1,
        options.quality
      )
    );

    const sourceBytes =
      new Uint8Array(
        await file.arrayBuffer()
      );

    const loadingTask =
      getDocument({
        data: sourceBytes,
      });

    const pdf =
      await loadingTask.promise;

    const result:
      ConvertedJpgPage[] = [];

    try {
      for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
      ) {
        const page =
          await pdf.getPage(
            pageNumber
          );

        const viewport =
          page.getViewport({
            scale,
          });

        const canvas =
          document.createElement(
            "canvas"
          );

        canvas.width = Math.ceil(
          viewport.width
        );

        canvas.height = Math.ceil(
          viewport.height
        );

        const context =
          canvas.getContext(
            "2d",
            {
              alpha: false,
            }
          );

        if (!context) {
          throw new Error(
            `Canvas could not be created for page ${pageNumber}.`
          );
        }

        context.fillStyle =
          "#ffffff";

        context.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;

        const blob =
          await canvasToJpegBlob(
            canvas,
            quality
          );

        const jpgBytes =
          new Uint8Array(
            await blob.arrayBuffer()
          );

        result.push({
          pageNumber,

          filename:
            createOutputName(
              file.name,
              pageNumber
            ),

          bytes: jpgBytes,
          width: canvas.width,
          height: canvas.height,
        });

        canvas.width = 0;
        canvas.height = 0;

        page.cleanup();
      }

      return result;
    } finally {
      await loadingTask.destroy();
    }
  }
}

export const jpgPdfService =
  new JpgPdfService();
