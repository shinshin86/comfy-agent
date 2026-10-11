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
  request: StudioRequest,
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
