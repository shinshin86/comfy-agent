import type { Language } from "../i18n/index.js";
import type { StudioRequest } from "./store.js";

export type RequestContextOutput = {
  job_id: string;
  output_index: number;
  preset: string;
  kind: string;
  path: string;
  prompt?: string;
};

const indent = (value: string, prefix: string) =>
  value
    .split(/\r\n|[\r\n\u2028\u2029]/)
    .map((line) => `${prefix}${line}`)
    .join("\n");

/**
 * Builds the text handed to an agent session, either pasted by the user or
 * read from the inbox. It carries IDs and absolute paths so the agent never
 * has to ask "which image?".
 */
export const buildAgentPrompt = (
  request: Omit<StudioRequest, "kind"> & { kind?: StudioRequest["kind"] },
  outputs: RequestContextOutput[],
  lang: Language,
  uploadPaths: Record<string, string> = {},
): string => {
  const ja = lang === "ja";
  const lines = [
    ja
      ? "comfy-agent Studio からの依頼です。`comfy-agent studio guide` の手順に沿って進めてください。"
      : "Request from comfy-agent Studio. Follow `comfy-agent studio guide`.",
    "",
    `${ja ? "依頼" : "Request"}:`,
    indent(request.text, "  "),
    `request_id: ${JSON.stringify(request.id)}`,
    `kind: ${request.kind ?? "creation"}`,
    `UI language: ${request.lang ?? lang}`,
    ...(request.kind === "prompt_assist"
      ? [
          ja
            ? "プロンプトの書き換えだけを行ってください。生成は実行しないでください。対象の `comfy-agent studio prompt-guide <preset>` を読み、意図を保ち、モデルが要求する構造以外の内容を足さずに整えてください。UI言語で短い意味の説明を添え、このrequest_idとpresetを指定して `comfy-agent studio suggest <file|->` で回答してください。"
            : "Rewrite the prompt only; do not generate. Read `comfy-agent studio prompt-guide <preset>`, preserve the intent and add only model-required structure. Explain its meaning briefly in the UI language. Reply with this request_id and preset using `comfy-agent studio suggest <file|->`.",
        ]
      : []),
  ];
  if (request.character) {
    lines.push(`${ja ? "キャラクター" : "Character"}: ${JSON.stringify(request.character)}`);
  }
  if (request.context) {
    lines.push(
      ja ? "作成フォームの設定:" : "Create panel context:",
      indent(JSON.stringify(request.context, null, 2), "  "),
    );
  }
  if (Object.keys(uploadPaths).length) {
    lines.push(
      ja ? "アップロード素材:" : "Uploaded inputs:",
      indent(JSON.stringify(uploadPaths, null, 2), "  "),
    );
  }
  if (outputs.length > 0) {
    lines.push(ja ? "選択中の素材:" : "Selected outputs:");
    for (const output of outputs) {
      lines.push(
        `- job ${JSON.stringify(output.job_id)} #${output.output_index} (${JSON.stringify(output.preset)}, ${JSON.stringify(output.kind)}): ${JSON.stringify(output.path)}`,
      );
      if (output.prompt) {
        lines.push("  prompt:", indent(output.prompt, "    "));
      }
    }
  }
  return lines.join("\n");
};
