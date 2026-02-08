import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";

export type ChatCompletionRequest = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: unknown }>;
  temperature?: number;
  max_tokens?: number;
};

export type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }> | undefined;
  error?: { message?: string; type?: string; code?: string };
};

export const createChatCompletion = async (
  apiKey: string,
  body: ChatCompletionRequest,
): Promise<ChatCompletionResponse> => {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as ChatCompletionResponse;
    if (!res.ok) {
      throw new CliError("OPENAI_API_ERROR", t("openai.api_failed"), 3, {
        status: res.status,
        error: json.error ?? null,
      });
    }
    return json;
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError("OPENAI_API_ERROR", t("openai.api_network_failed"), 3, {
      cause: String(err),
    });
  }
};
