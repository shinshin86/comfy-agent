import path from "node:path";
import { promises as fs } from "node:fs";
import { createChatCompletion } from "../api/openai.js";
import { CliError } from "../io/errors.js";
import { log, print, printJson } from "../io/output.js";
import { AnalyzeModelOutputSchema } from "../analyze/schema.js";
import { t } from "../i18n/index.js";

export type AnalyzeOptions = {
  json?: boolean;
  out?: string;
  model?: string;
  detail?: string;
  prompt?: string;
  apiKey?: string;
  threshold?: string;
  maxOutputTokens?: string;
  temperature?: string;
};

const SUPPORTED_EXT = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_DETAIL = "low";

const toMiBString = (bytes: number) => {
  return (bytes / (1024 * 1024)).toFixed(2);
};

const resolveApiKey = (options: AnalyzeOptions) => {
  return options.apiKey || process.env.OPENAI_API_KEY || "";
};

const parseNumber = (value: string, name: string) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new CliError("INVALID_PARAM", t("analyze.invalid_number", { name }), 2, { value });
  }
  return num;
};

const resolveThreshold = (options: AnalyzeOptions) => {
  if (!options.threshold) return 0.6;
  const num = parseNumber(options.threshold, "threshold");
  if (num < 0 || num > 1) {
    throw new CliError("INVALID_PARAM", t("analyze.invalid_threshold"), 2, { value: num });
  }
  return num;
};

const resolveDetail = (options: AnalyzeOptions) => {
  const detail = options.detail ?? DEFAULT_DETAIL;
  if (detail !== "low" && detail !== "high" && detail !== "auto") {
    throw new CliError("INVALID_PARAM", t("analyze.invalid_detail"), 2, {
      value: detail,
    });
  }
  return detail;
};

const ensureFile = async (filePath: string) => {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new CliError("FILE_NOT_FOUND", t("analyze.not_file", { path: filePath }), 2, {
        path: filePath,
      });
    }
    if (stat.size > MAX_IMAGE_BYTES) {
      const sizeMB = toMiBString(stat.size);
      const maxMB = toMiBString(MAX_IMAGE_BYTES);
      throw new CliError(
        "IMAGE_TOO_LARGE",
        t("analyze.image_too_large", {
          sizeMB,
          maxMB,
          sizeBytes: stat.size,
          maxBytes: MAX_IMAGE_BYTES,
        }),
        2,
        {
          size: stat.size,
          max: MAX_IMAGE_BYTES,
          sizeMB,
          maxMB,
        },
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("FILE_NOT_FOUND", t("analyze.file_not_found", { path: filePath }), 2, {
        path: filePath,
      });
    }
    if (err instanceof CliError) throw err;
    throw err;
  }
};

const detectMime = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  const mime = SUPPORTED_EXT.get(ext);
  if (!mime) {
    throw new CliError("UNSUPPORTED_IMAGE", t("analyze.unsupported_image"), 2, {
      ext,
      supported: Array.from(SUPPORTED_EXT.keys()),
    });
  }
  return mime;
};

const buildSystemPrompt = () => {
  return [
    "You are an image evaluator.",
    "Given an instruction and an image, judge how well the image matches the instruction.",
    "Return JSON only with keys: score, summary, tags, missing, extra, reasons.",
    "score must be a number between 0 and 1.",
    "summary should be short (one sentence).",
    "tags/missing/extra/reasons are arrays of short strings.",
    "Do not include any additional text.",
  ].join(" ");
};

const buildUserContent = (prompt: string, dataUrl: string, detail: string) => {
  return [
    { type: "text", text: `Instruction: ${prompt}` },
    { type: "image_url", image_url: { url: dataUrl, detail } },
  ];
};

const toDataUrl = async (filePath: string, mime: string) => {
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString("base64");
  return `data:${mime};base64,${base64}`;
};

const parseModelOutput = (text: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new CliError("ANALYZE_PARSE_ERROR", t("analyze.parse_error"), 3, {
      raw: text,
    });
  }

  const result = AnalyzeModelOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError("ANALYZE_INVALID_RESPONSE", t("analyze.invalid_response"), 3, {
      issues: result.error.issues,
      raw: parsed,
    });
  }

  return result.data;
};

export const runAnalyze = async (imagePath: string, options: AnalyzeOptions) => {
  const prompt = options.prompt?.trim();
  if (!prompt) {
    throw new CliError("MISSING_REQUIRED_PARAM", t("param.required", { param: "prompt" }), 2, {
      param: "prompt",
    });
  }

  const apiKey = resolveApiKey(options);
  if (!apiKey) {
    throw new CliError("MISSING_API_KEY", t("analyze.missing_api_key"), 2);
  }

  const model = options.model ?? DEFAULT_MODEL;
  const detail = resolveDetail(options);
  const threshold = resolveThreshold(options);
  const temperature = options.temperature ? parseNumber(options.temperature, "temperature") : 0;
  const maxTokens = options.maxOutputTokens
    ? Math.floor(parseNumber(options.maxOutputTokens, "max-output-tokens"))
    : 300;

  await ensureFile(imagePath);
  const mime = detectMime(imagePath);
  const dataUrl = await toDataUrl(imagePath, mime);

  log(t("analyze.request_log", { model, detail }));

  const response = await createChatCompletion(apiKey, {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserContent(prompt, dataUrl, detail) },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new CliError("ANALYZE_EMPTY_RESPONSE", t("analyze.empty_response"), 3);
  }

  const result = parseModelOutput(content);
  const match = result.score >= threshold;

  const payload = {
    ok: true,
    model,
    image: imagePath,
    prompt,
    detail,
    threshold,
    match,
    score: result.score,
    summary: result.summary,
    tags: result.tags ?? [],
    missing: result.missing ?? [],
    extra: result.extra ?? [],
    reasons: result.reasons ?? [],
  } as const;

  if (options.out) {
    const outPath = path.resolve(options.out);
    await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  }

  if (options.json) {
    printJson(payload);
    return;
  }

  print(
    t("analyze.match", {
      match: match ? "YES" : "NO",
      score: result.score.toFixed(2),
    }),
  );
  print(t("analyze.summary", { summary: result.summary }));
  if (result.reasons?.length) {
    for (const reason of result.reasons) {
      print(`- ${reason}`);
    }
  }
};
