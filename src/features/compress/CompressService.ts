import { PDFDocument } from "pdf-lib";

export type CompressionLevel =
  | "low"
  | "recommended"
  | "maximum";

class CompressService {
  async compress(
    file: File,
    level: CompressionLevel
  ): Promise<Uint8Array> {
    const sourceBytes = new Uint8Array(
      await file.arrayBuffer()
    );

    const pdf = await PDFDocument.load(
      sourceBytes
    );

    /*
      pdf-lib cannot directly recompress embedded
      images. These options provide lossless PDF
      optimization.

      Recommended and Maximum also clear unnecessary
      document metadata.
    */

    if (
      level === "recommended" ||
      level === "maximum"
    ) {
      pdf.setTitle("");
      pdf.setAuthor("");
      pdf.setSubject("");
      pdf.setKeywords([]);
      pdf.setCreator("");
      pdf.setProducer("");
    }

    const optimizedBytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
      objectsPerTick:
        level === "maximum"
          ? 100
          : level === "recommended"
            ? 50
            : 20,
    });

    // Never return a file larger than the original.
    if (
      optimizedBytes.byteLength >=
      sourceBytes.byteLength
    ) {
      return sourceBytes;
    }

    return optimizedBytes;
  }
}

export const compressService =
  new CompressService();