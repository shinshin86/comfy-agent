import { execFile } from "node:child_process";
import { sceneInvalid } from "./schema.js";

export const TRANSCRIBE_TIMEOUT_MS = 300_000;
export const TRANSCRIBE_MAX_BYTES = 1024 * 1024;
export type Transcript =
  | { status: "skipped"; reason: string }
  | { status: "completed"; text: string; similarity: number | null }
  | { status: "failed"; reason: string };

export const expectedDialogue = (prompt: string): string =>
  [...prompt.matchAll(/<d>\s*(?:\[[^\]]*\]\s*)?([\s\S]*?)<\/d>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .join("\n");
export const normalizeDialogue = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\p{S}\sー〜～っッぁぃぅぇぉァィゥェォゎヮ]/gu, "");
export const characterSimilarity = (expected: string, actual: string): number => {
  const left = Array.from(normalizeDialogue(expected));
  const right = Array.from(normalizeDialogue(actual));
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;
  // Dialogue is short; reject huge input rather than allocate an unbounded matrix.
  if (left.length > 10_000 || right.length > 10_000) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < right.length; j++)
      row.push(
        Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + (left[i] === right[j] ? 0 : 1)),
      );
    previous = row;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
};

/** Quote-aware argv parsing only: input paths and command text never enter a shell. */
export const transcribeArgv = (command: string, audio: string): string[] => {
  const args: string[] = [];
  let token = "";
  let quote = "";
  let active = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote === "'") {
      if (char === "'") quote = "";
      else token += char;
      continue;
    }
    if (char === "\\") {
      const next = command[i + 1];
      if (next === undefined)
        throw sceneInvalid("checks.transcribe_cmd", "Trailing escape in command");
      if (quote === '"' && !['"', "\\", "$", "`", "\n"].includes(next)) token += char;
      else {
        token += next === "\n" ? "" : next;
        i++;
      }
      active = true;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = "";
      else token += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      active = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (active) args.push(token);
      token = "";
      active = false;
    } else {
      if (/[|&;<>]/.test(char))
        throw sceneInvalid(
          "checks.transcribe_cmd",
          "Shell operators are unsupported; put pipes or redirection in a script",
        );
      token += char;
      active = true;
    }
  }
  if (quote) throw sceneInvalid("checks.transcribe_cmd", "Unclosed quote in command");
  if (active) args.push(token);
  if (!args[0]) throw sceneInvalid("checks.transcribe_cmd", "Command is empty");
  if (!args.some((arg) => arg.includes("{audio}")))
    throw sceneInvalid("checks.transcribe_cmd", "Include {audio} for the cut WAV file");
  return args.map((arg) => arg.replaceAll("{audio}", audio));
};

export const transcribe = async (
  command: string,
  audio: string,
  expected: string,
  cwd: string,
  timeoutMs = TRANSCRIBE_TIMEOUT_MS,
): Promise<Transcript> => {
  const [executable, ...args] = transcribeArgv(command, audio);
  return new Promise((resolve) => {
    execFile(
      executable,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: TRANSCRIBE_MAX_BYTES,
        encoding: "utf-8",
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          const reason =
            code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
              ? "output_limit"
              : (error as typeof error & { killed?: boolean }).killed
                ? "timeout"
                : "command_failed";
          resolve({ status: "failed", reason });
        } else {
          const text = stdout.trim();
          resolve({
            status: "completed",
            text,
            similarity: expected ? characterSimilarity(expected, text) : null,
          });
        }
      },
    );
  });
};
