// The language pair the UI offers. The server keeps its own English names
// for the same codes in artifacts/api-server/src/routes/translate.ts.
export type Language = { code: string; label: string; flag: string };

export const LANGUAGES: Language[] = [
  { code: "mn", label: "Монгол", flag: "🇲🇳" },
  { code: "en", label: "Англи", flag: "🇺🇸" },
  { code: "zh", label: "Хятад", flag: "🇨🇳" },
  { code: "ru", label: "Орос", flag: "🇷🇺" },
  { code: "ja", label: "Япон", flag: "🇯🇵" },
  { code: "ko", label: "Солонгос", flag: "🇰🇷" },
  { code: "th", label: "Тайланд", flag: "🇹🇭" },
  { code: "tr", label: "Турк", flag: "🇹🇷" },
  { code: "de", label: "Герман", flag: "🇩🇪" },
  { code: "fr", label: "Франц", flag: "🇫🇷" },
  { code: "es", label: "Испани", flag: "🇪🇸" },
  { code: "it", label: "Итали", flag: "🇮🇹" },
  { code: "ar", label: "Араб", flag: "🇦🇪" },
  { code: "hi", label: "Хинди", flag: "🇮🇳" },
  { code: "vi", label: "Вьетнам", flag: "🇻🇳" },
  { code: "id", label: "Индонези", flag: "🇮🇩" },
  { code: "ms", label: "Малайз", flag: "🇲🇾" },
  { code: "pt", label: "Португал", flag: "🇵🇹" },
  { code: "pl", label: "Польш", flag: "🇵🇱" },
  { code: "uk", label: "Украин", flag: "🇺🇦" },
];
