import { describe, expect, it, beforeEach } from "vitest";
import { resolveLanguage, setLanguage, t } from "../src/i18n/index.js";
import { messages as en } from "../src/i18n/en.js";
import { messages as ja } from "../src/i18n/ja.js";

describe("i18n", () => {
  beforeEach(() => {
    setLanguage("en");
  });

  it("resolveLanguage respects --lang", () => {
    const lang = resolveLanguage(["node", "cli", "--lang", "ja"], {} as NodeJS.ProcessEnv);
    expect(lang).toBe("ja");
  });

  it("resolveLanguage respects COMFY_AGENT_LANG", () => {
    const lang = resolveLanguage(["node", "cli"], { COMFY_AGENT_LANG: "ja" } as NodeJS.ProcessEnv);
    expect(lang).toBe("ja");
  });

  it("resolveLanguage defaults to en", () => {
    const lang = resolveLanguage(["node", "cli"], {} as NodeJS.ProcessEnv);
    expect(lang).toBe("en");
  });

  it("t returns localized strings", () => {
    setLanguage("ja");
    expect(t("init.next")).toContain("次の手順");
    setLanguage("en");
    expect(t("init.next")).toContain("Next:");
  });

  it("t replaces params", () => {
    setLanguage("en");
    expect(t("init.done", { scope: "local" })).toContain("local");
  });

  it("message keys are consistent", () => {
    const enKeys = Object.keys(en).sort();
    const jaKeys = Object.keys(ja).sort();
    expect(jaKeys).toEqual(enKeys);
  });
});
