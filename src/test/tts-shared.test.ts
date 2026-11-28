import { describe, expect, it } from "vitest";
import { buildSsml, escapeXml, normalizeTtsText, selectVoice } from "@/lib/tts.shared";

describe("Azure Speech request rules", () => {
  it("selects Aigul and Daulet for Kazakh and Svetlana and Dmitry for Russian", () => {
    expect(selectVoice("kk", "female")).toBe("kk-KZ-AigulNeural");
    expect(selectVoice("kk", "male")).toBe("kk-KZ-DauletNeural");
    expect(selectVoice("ru", "female")).toBe("ru-RU-SvetlanaNeural");
    expect(selectVoice("ru", "male")).toBe("ru-RU-DmitryNeural");
  });

  it("trims and truncates every request to 500 characters", () => {
    expect(normalizeTtsText(`  ${"а".repeat(600)}  `)).toHaveLength(500);
  });

  it("escapes XML before sending patient text to Azure", () => {
    expect(escapeXml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&apos;");
    expect(buildSsml("А & Б", "ru", "female")).toContain("А &amp; Б");
  });

  it("uses the natural -5% speaking rate", () => {
    expect(buildSsml("Сәлеметсіз бе", "kk", "female")).toContain('rate="-5%"');
  });
});
