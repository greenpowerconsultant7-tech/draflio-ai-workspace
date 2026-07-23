import {
  getOcrLanguage,
  isOcrLanguageCode,
  type OcrLanguageCode,
  type OcrLanguageInfo,
} from "../../../shared/ocrLanguages";

export function validatePublicOcrLanguage(value: unknown): OcrLanguageInfo {
  if (!value || typeof value !== "object") {
    throw new Error("The OCR server returned invalid language data.");
  }

  const language = value as Partial<OcrLanguageInfo>;
  if (
    !isOcrLanguageCode(language.code) ||
    typeof language.label !== "string" ||
    language.label !== getOcrLanguage(language.code).label
  ) {
    throw new Error("The OCR server returned invalid language data.");
  }

  return {
    code: language.code,
    label: language.label,
  };
}

export function createOcrLanguageFormData(file: File, language: OcrLanguageCode) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("ocrLanguage", language);
  return formData;
}
