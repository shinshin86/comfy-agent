const USERDATA_PREFIXES = [
  "/userdata/",
  "/api/userdata/",
  "/v2/userdata/",
  "/api/v2/userdata/",
] as const;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const stripUserdataPrefix = (value: string): string => {
  for (const prefix of USERDATA_PREFIXES) {
    const idx = value.indexOf(prefix);
    if (idx >= 0) return value.slice(idx + prefix.length);
  }
  return value;
};

const normalizePathBase = (rawPath: string): string | null => {
  if (!rawPath) return null;
  let value = rawPath.trim();
  if (!value) return null;

  try {
    value = decodeURIComponent(value);
  } catch {
    // keep original value
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      value = parsed.pathname;
    } catch {
      return null;
    }
  }

  value = stripUserdataPrefix(value);
  value = value.split("?")[0] ?? value;
  value = value.replace(/^\.?\//, "");
  value = value.replace(/^\/+/, "");
  return value;
};

export const normalizeUserdataFilePath = (rawPath: string): string | null => {
  const value = normalizePathBase(rawPath);
  if (!value) return null;
  if (!value.toLowerCase().endsWith(".json")) return null;
  return value;
};

export const normalizeUserdataDirPath = (rawPath: string): string | null => {
  const value = normalizePathBase(rawPath);
  if (!value) return null;
  const normalized = value.replace(/\/+$/, "");
  return normalized || null;
};

export const collectUserdataJsonPaths = (value: unknown, out: Set<string>, depth = 0): void => {
  if (depth > 8) return;

  if (typeof value === "string") {
    const normalized = normalizeUserdataFilePath(value);
    if (normalized) out.add(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectUserdataJsonPaths(item, out, depth + 1);
    }
    return;
  }

  const obj = asRecord(value);
  if (!obj) return;

  const dirKeys = ["subfolder", "folder", "dir", "directory", "parent"];
  const fileKeys = ["filename", "file", "name", "path", "filepath"];

  const dirs = dirKeys
    .map((key) => asString(obj[key]))
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeUserdataDirPath(item))
    .filter((item): item is string => Boolean(item));

  const files = fileKeys
    .map((key) => asString(obj[key]))
    .filter((item): item is string => typeof item === "string");

  for (const dir of dirs) {
    for (const file of files) {
      const combined = normalizeUserdataFilePath(`${dir}/${file}`);
      if (combined) out.add(combined);
    }
  }

  for (const [key, entry] of Object.entries(obj)) {
    const normalizedKey = normalizeUserdataFilePath(key);
    if (normalizedKey) out.add(normalizedKey);
    collectUserdataJsonPaths(entry, out, depth + 1);
  }
};

export const endpointUsesWorkflowsDir = (endpoint: string): boolean => {
  return endpoint.includes("dir=workflows") || endpoint.includes("path=workflows");
};

export const applyWorkflowsDirContext = (candidatePath: string, endpoint: string): string => {
  if (!endpointUsesWorkflowsDir(endpoint)) return candidatePath;
  const normalized = candidatePath.replace(/^\/+/, "");
  if (normalized.startsWith("workflows/")) return normalized;
  return `workflows/${normalized}`;
};
