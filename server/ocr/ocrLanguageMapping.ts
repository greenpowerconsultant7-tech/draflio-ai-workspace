import { OCRSupportedLocale } from "@adobe/pdfservices-node-sdk";
import {
  DEFAULT_OCR_LANGUAGE_CODE,
  OCR_LANGUAGES,
  isOcrLanguageCode,
  toOcrLanguageInfo,
  type OcrLanguageCode,
} from "../../shared/ocrLanguages";

const sdkLocaleByCode = {
  "da-DK": OCRSupportedLocale.DA_DK,
  "lt-LT": OCRSupportedLocale.LT_LT,
  "sl-SI": OCRSupportedLocale.SL_SI,
  "el-GR": OCRSupportedLocale.EL_GR,
  "ru-RU": OCRSupportedLocale.RU_RU,
  "en-US": OCRSupportedLocale.EN_US,
  "zh-HK": OCRSupportedLocale.ZH_HK,
  "hu-HU": OCRSupportedLocale.HU_HU,
  "et-EE": OCRSupportedLocale.ET_EE,
  "pt-BR": OCRSupportedLocale.PT_BR,
  "uk-UA": OCRSupportedLocale.UK_UA,
  "nb-NO": OCRSupportedLocale.NB_NO,
  "pl-PL": OCRSupportedLocale.PL_PL,
  "lv-LV": OCRSupportedLocale.LV_LV,
  "fi-FI": OCRSupportedLocale.FI_FI,
  "ja-JP": OCRSupportedLocale.JA_JP,
  "es-ES": OCRSupportedLocale.ES_ES,
  "bg-BG": OCRSupportedLocale.BG_BG,
  "en-GB": OCRSupportedLocale.EN_GB,
  "cs-CZ": OCRSupportedLocale.CS_CZ,
  "mt-MT": OCRSupportedLocale.MT_MT,
  "de-DE": OCRSupportedLocale.DE_DE,
  "hr-HR": OCRSupportedLocale.HR_HR,
  "sk-SK": OCRSupportedLocale.SK_SK,
  "sr-SR": OCRSupportedLocale.SR_SR,
  "ca-CA": OCRSupportedLocale.CA_CA,
  "mk-MK": OCRSupportedLocale.MK_MK,
  "ko-KR": OCRSupportedLocale.KO_KR,
  "de-CH": OCRSupportedLocale.DE_CH,
  "nl-NL": OCRSupportedLocale.NL_NL,
  "zh-CN": OCRSupportedLocale.ZH_CN,
  "sv-SE": OCRSupportedLocale.SV_SE,
  "it-IT": OCRSupportedLocale.IT_IT,
  "no-NO": OCRSupportedLocale.NO_NO,
  "tr-TR": OCRSupportedLocale.TR_TR,
  "fr-FR": OCRSupportedLocale.FR_FR,
  "ro-RO": OCRSupportedLocale.RO_RO,
  "iw-IL": OCRSupportedLocale.IW_IL,
} satisfies Record<OcrLanguageCode, OCRSupportedLocale>;

export class InvalidOcrLanguageError extends Error {
  constructor() {
    super("Select a supported OCR language.");
    this.name = "InvalidOcrLanguageError";
  }
}

export function parseOcrLanguage(value: unknown, omittedDefaults = true): OcrLanguageCode {
  if (value === undefined && omittedDefaults) return DEFAULT_OCR_LANGUAGE_CODE;
  if (!isOcrLanguageCode(value)) throw new InvalidOcrLanguageError();
  return value;
}

export function getSdkOcrLocale(code: OcrLanguageCode): OCRSupportedLocale {
  return sdkLocaleByCode[code];
}

export function assertOcrLanguageMappingComplete() {
  const providerValues = new Set(Object.values(OCRSupportedLocale));
  return (
    OCR_LANGUAGES.every((entry) => sdkLocaleByCode[entry.code] === entry.code) &&
    providerValues.size === OCR_LANGUAGES.length
  );
}

export { toOcrLanguageInfo };
