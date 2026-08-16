export type OutputFileRef = {
  filename: string;
  subfolder?: string;
  type?: string;
  kind?: string;
};

type Provider = {
  name: string;
  keys: string[];
};

const PROVIDERS: Provider[] = [
  { name: "image", keys: ["images"] },
  { name: "video", keys: ["videos"] },
  { name: "gif", keys: ["gifs"] },
  { name: "audio", keys: ["audios", "audio"] },
];

const toFileRef = (item: unknown, kind?: string): OutputFileRef | null => {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const filename = obj.filename;
  if (typeof filename !== "string" || filename.length === 0) return null;

  const subfolder = typeof obj.subfolder === "string" ? obj.subfolder : undefined;
  const type = typeof obj.type === "string" ? obj.type : undefined;
  return {
    filename,
    ...(subfolder === undefined ? {} : { subfolder }),
    ...(type === undefined ? {} : { type }),
    ...(kind === undefined ? {} : { kind }),
  };
};

const collectFromValue = (value: unknown, kind?: string): OutputFileRef[] => {
  if (!Array.isArray(value)) return [];
  const files: OutputFileRef[] = [];
  for (const item of value) {
    const ref = toFileRef(item, kind);
    if (ref) files.push(ref);
  }
  return files;
};

const dedupe = (files: OutputFileRef[]) => {
  const seen = new Set<string>();
  const unique: OutputFileRef[] = [];
  for (const file of files) {
    const key = `${file.type ?? ""}|${file.subfolder ?? ""}|${file.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }
  return unique;
};

const collectFromNodeOutput = (nodeOutput: Record<string, unknown>) => {
  const collected: OutputFileRef[] = [];

  for (const provider of PROVIDERS) {
    for (const key of provider.keys) {
      collected.push(...collectFromValue(nodeOutput[key], provider.name));
    }
  }

  for (const value of Object.values(nodeOutput)) {
    collected.push(...collectFromValue(value));
  }

  return dedupe(collected);
};

export const extractOutputFiles = (historyEntry: unknown): OutputFileRef[] => {
  if (!historyEntry || typeof historyEntry !== "object") return [];
  const entry = historyEntry as Record<string, unknown>;
  const outputsValue = entry.outputs;
  if (!outputsValue || typeof outputsValue !== "object") return [];

  const outputs = outputsValue as Record<string, unknown>;
  const files: OutputFileRef[] = [];

  for (const nodeOutput of Object.values(outputs)) {
    if (!nodeOutput || typeof nodeOutput !== "object") continue;
    files.push(...collectFromNodeOutput(nodeOutput as Record<string, unknown>));
  }

  return dedupe(files);
};
