import path from "node:path";
import { promises as fs } from "node:fs";

export type AppendNoteInput = {
  at: string;
  kit?: string;
  text: string;
};

export const appendNote = async (dir: string, input: AppendNoteInput): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
  const heading = `## ${input.at}${input.kit ? ` (${input.kit})` : ""}`;
  await fs.appendFile(path.join(dir, "notes.md"), `${heading}\n\n${input.text}\n\n`, "utf-8");
};

export const readNotes = async (dir: string, options: { tail?: number } = {}): Promise<string> => {
  let notes: string;
  try {
    notes = await fs.readFile(path.join(dir, "notes.md"), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
  if (options.tail === undefined) return notes;
  return Array.from(notes).slice(-Math.max(0, options.tail)).join("");
};
