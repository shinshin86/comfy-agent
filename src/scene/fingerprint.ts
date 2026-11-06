import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export const canonicalJson = (value: unknown): string => {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, entry]) => entry !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    return item;
  };
  return JSON.stringify(canonical(value));
};
export const fingerprint = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export const hashFile = async (file: string): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

/** Reuse hashes within one run while still detecting replaced or modified files. */
export class FileHashCache {
  private entries = new Map<string, { stamp: string; hash: string }>();
  async hash(file: string): Promise<string> {
    const info = await stat(file, { bigint: true });
    const stamp = `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
    const entry = this.entries.get(file);
    if (entry?.stamp === stamp) return entry.hash;
    const hash = await hashFile(file);
    this.entries.set(file, { stamp, hash });
    return hash;
  }
}

export const changeReasons = (before: unknown, after: unknown, prefix = ""): string[] => {
  if (canonicalJson(before) === canonicalJson(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const a = before as Record<string, unknown>;
    const b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .sort()
      .flatMap((key) => changeReasons(a[key], b[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix || "inputs"];
};
