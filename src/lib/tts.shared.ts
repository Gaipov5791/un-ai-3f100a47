import type { Lang } from "@/lib/i18n";

export const TTS_MAX_CHARS = 500;
export const TTS_RATE = "-5%";
export type VoiceGender = "female" | "male";

const voices = {
  kk: { female: "kk-KZ-AigulNeural", male: "kk-KZ-DauletNeural" },
  ru: { female: "ru-RU-SvetlanaNeural", male: "ru-RU-DmitryNeural" },
} as const;

export function selectVoice(lang: Lang, gender: VoiceGender) {
  return voices[lang][gender];
}

export function normalizeTtsText(text: string) {
  return text.trim().slice(0, TTS_MAX_CHARS);
}

export function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]!);
}

export function buildSsml(text: string, lang: Lang, gender: VoiceGender) {
  const voice = selectVoice(lang, gender);
  return `<speak version="1.0" xml:lang="${lang === "kk" ? "kk-KZ" : "ru-RU"}"><voice name="${voice}"><prosody rate="${TTS_RATE}">${escapeXml(text)}</prosody></voice></speak>`;
}
