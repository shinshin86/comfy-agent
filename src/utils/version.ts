import { createRequire } from "node:module";

export const getPackageVersion = (): string => {
  try {
    const packageJson = createRequire(import.meta.url)("../../package.json") as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0-unknown";
  } catch {
    return "0.0.0-unknown";
  }
};
