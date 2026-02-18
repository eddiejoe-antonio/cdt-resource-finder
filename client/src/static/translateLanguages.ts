export type Lang = { value: string; label: string };

/**
 * Practical “top 30” for CA public-facing services.
 * Adjust anytime (labels can be whatever you want).
 */
export const TOP_LANGS_30: Lang[] = [
  { value: "", label: "English" },

  { value: "es", label: "Español" },
  { value: "zh-CN", label: "中文 (简体)" },
  { value: "zh-TW", label: "中文 (繁體)" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "tl", label: "Tagalog" },
  { value: "ko", label: "한국어" },

  { value: "hy", label: "Հայերեն (Armenian)" },
  { value: "fa", label: "فارسی (Persian)" },
  { value: "ru", label: "Русский (Russian)" },
  { value: "ar", label: "العربية (Arabic)" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "ja", label: "日本語 (Japanese)" },
  { value: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
  { value: "km", label: "ខ្មែរ (Khmer)" },
  { value: "hmn", label: "Hmong" },
  { value: "th", label: "ไทย (Thai)" },

  { value: "fr", label: "Français (French)" },
  { value: "de", label: "Deutsch (German)" },
  { value: "pt", label: "Português (Portuguese)" },
  { value: "it", label: "Italiano (Italian)" },
  { value: "pl", label: "Polski (Polish)" },
  { value: "uk", label: "Українська (Ukrainian)" },
  { value: "tr", label: "Türkçe (Turkish)" },
  { value: "he", label: "עברית (Hebrew)" },

  { value: "ur", label: "اردو (Urdu)" },
  { value: "bn", label: "বাংলা (Bengali)" },
  { value: "gu", label: "ગુજરાતી (Gujarati)" },
  { value: "ta", label: "தமிழ் (Tamil)" },
  { value: "te", label: "తెలుగు (Telugu)" },
];
