import { messages as enMessages, type MessageKey } from "./en.js";
import { messages as jaMessages } from "./ja.js";

export type Language = "en" | "ja";

const catalogs: Record<Language, Record<MessageKey, string>> = {
  en: enMessages,
  ja: jaMessages as Record<MessageKey, string>,
};

let currentLanguage: Language = "en";

export const setLanguage = (lang: string) => {
  if (lang === "en" || lang === "ja") {
    currentLanguage = lang;
  }
};

export const resolveLanguage = (argv: string[] = process.argv, env = process.env): Language => {
  const fromArg = readLangArg(argv);
  if (fromArg) return fromArg;
  const envLang = env.COMFY_AGENT_LANG;
  if (envLang === "en" || envLang === "ja") return envLang;
  return "en";
};

const readLangArg = (argv: string[]): Language | null => {
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--lang") {
      const value = argv[i + 1];
      if (value === "en" || value === "ja") return value;
    }
    if (token.startsWith("--lang=")) {
      const value = token.split("=")[1];
      if (value === "en" || value === "ja") return value;
    }
  }
  return null;
};

export const t = (key: MessageKey, params?: Record<string, string | number>): string => {
  const catalog = catalogs[currentLanguage] ?? catalogs.en;
  const template = catalog[key] ?? catalogs.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
};

export const currentLang = () => currentLanguage;
