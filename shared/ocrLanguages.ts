export const DEFAULT_OCR_LANGUAGE_CODE = "en-US";

export const OCR_LANGUAGES = [
  { code: "en-US", label: "English (United States)", language: "English", region: "United States" },
  { code: "bg-BG", label: "Bulgarian (Bulgaria)", language: "Bulgarian", region: "Bulgaria" },
  { code: "ca-CA", label: "Catalan (Canada)", language: "Catalan", region: "Canada" },
  { code: "zh-CN", label: "Chinese (China)", language: "Chinese", region: "China" },
  { code: "zh-HK", label: "Chinese (Hong Kong)", language: "Chinese", region: "Hong Kong" },
  { code: "hr-HR", label: "Croatian (Croatia)", language: "Croatian", region: "Croatia" },
  { code: "cs-CZ", label: "Czech (Czech Republic)", language: "Czech", region: "Czech Republic" },
  { code: "da-DK", label: "Danish (Denmark)", language: "Danish", region: "Denmark" },
  { code: "nl-NL", label: "Dutch (Netherlands)", language: "Dutch", region: "Netherlands" },
  {
    code: "en-GB",
    label: "English (United Kingdom)",
    language: "English",
    region: "United Kingdom",
  },
  { code: "et-EE", label: "Estonian (Estonia)", language: "Estonian", region: "Estonia" },
  { code: "fi-FI", label: "Finnish (Finland)", language: "Finnish", region: "Finland" },
  { code: "fr-FR", label: "French (France)", language: "French", region: "France" },
  { code: "de-DE", label: "German (Germany)", language: "German", region: "Germany" },
  { code: "de-CH", label: "German (Switzerland)", language: "German", region: "Switzerland" },
  { code: "el-GR", label: "Greek (Greece)", language: "Greek", region: "Greece" },
  { code: "iw-IL", label: "Hebrew (Israel)", language: "Hebrew", region: "Israel" },
  { code: "hu-HU", label: "Hungarian (Hungary)", language: "Hungarian", region: "Hungary" },
  { code: "it-IT", label: "Italian (Italy)", language: "Italian", region: "Italy" },
  { code: "ja-JP", label: "Japanese (Japan)", language: "Japanese", region: "Japan" },
  { code: "ko-KR", label: "Korean (Korea)", language: "Korean", region: "Korea" },
  { code: "lv-LV", label: "Latvian (Latvia)", language: "Latvian", region: "Latvia" },
  { code: "lt-LT", label: "Lithuanian (Lithuania)", language: "Lithuanian", region: "Lithuania" },
  { code: "mk-MK", label: "Macedonian (Macedonia)", language: "Macedonian", region: "Macedonia" },
  { code: "mt-MT", label: "Maltese (Malta)", language: "Maltese", region: "Malta" },
  { code: "no-NO", label: "Norwegian (Norway)", language: "Norwegian", region: "Norway" },
  {
    code: "nb-NO",
    label: "Norwegian Bokmål (Norway)",
    language: "Norwegian Bokmål",
    region: "Norway",
  },
  { code: "pl-PL", label: "Polish (Poland)", language: "Polish", region: "Poland" },
  { code: "pt-BR", label: "Portuguese (Brazil)", language: "Portuguese", region: "Brazil" },
  { code: "ro-RO", label: "Romanian (Romania)", language: "Romanian", region: "Romania" },
  { code: "ru-RU", label: "Russian (Russia)", language: "Russian", region: "Russia" },
  { code: "sr-SR", label: "Serbian (Serbia)", language: "Serbian", region: "Serbia" },
  { code: "sk-SK", label: "Slovak (Slovakia)", language: "Slovak", region: "Slovakia" },
  { code: "sl-SI", label: "Slovenian (Slovenia)", language: "Slovenian", region: "Slovenia" },
  { code: "es-ES", label: "Spanish (Spain)", language: "Spanish", region: "Spain" },
  { code: "sv-SE", label: "Swedish (Sweden)", language: "Swedish", region: "Sweden" },
  { code: "tr-TR", label: "Turkish (Turkey)", language: "Turkish", region: "Turkey" },
  { code: "uk-UA", label: "Ukrainian (Ukraine)", language: "Ukrainian", region: "Ukraine" },
] as const;

export type OcrLanguageCode = (typeof OCR_LANGUAGES)[number]["code"];
export type OcrLanguageInfo = {
  code: OcrLanguageCode;
  label: string;
};

const languageByCode = new Map<string, (typeof OCR_LANGUAGES)[number]>(
  OCR_LANGUAGES.map((entry) => [entry.code, entry]),
);

export function isOcrLanguageCode(value: unknown): value is OcrLanguageCode {
  return typeof value === "string" && languageByCode.has(value);
}

export function getOcrLanguage(code: OcrLanguageCode) {
  const entry = languageByCode.get(code);
  if (!entry) {
    throw new Error("Unsupported OCR language code.");
  }
  return entry;
}

export function toOcrLanguageInfo(code: OcrLanguageCode): OcrLanguageInfo {
  const entry = getOcrLanguage(code);
  return { code: entry.code, label: entry.label };
}

export function searchOcrLanguages(query: string) {
  const normalized = query.trim().toLocaleLowerCase("en");
  if (!normalized) return OCR_LANGUAGES;
  return OCR_LANGUAGES.filter((entry) =>
    [entry.code, entry.label, entry.language, entry.region].some((value) =>
      value.toLocaleLowerCase("en").includes(normalized),
    ),
  );
}
