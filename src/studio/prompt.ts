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

/**
 * Builds the text handed to an agent session, either pasted by the user or
 * read from the inbox. It carries IDs and absolute paths so the agent never
 * has to ask "which image?".
 */
export const buildAgentPrompt = (
  request: StudioRequest,
  outputs: RequestContextOutput[],
  lang: Language,
): string => {
  const ja = lang === "ja";
  const lines = [
    ja
      ? "comfy-agent Studio からの依頼です。`comfy-agent studio guide` の手順に沿って進めてください。"
      : "Request from comfy-agent Studio. Follow `comfy-agent studio guide`.",
    "",
    `${ja ? "依頼" : "Request"}: ${request.text}`,
    `request_id: ${request.id}`,
  ];
  if (request.character) {
    lines.push(`${ja ? "キャラクター" : "Character"}: ${request.character}`);
  }
  if (outputs.length > 0) {
    lines.push(ja ? "選択中の素材:" : "Selected outputs:");
    for (const output of outputs) {
      lines.push(
        `- job ${output.job_id} #${output.output_index} (${output.preset}, ${output.kind}): ${output.path}`,
      );
      if (output.prompt) {
        lines.push(`  prompt: ${output.prompt}`);
      }
    }
  }
  return lines.join("\n");
};
