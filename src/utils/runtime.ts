import { CliError } from "../io/errors.js";
import { log } from "../io/output.js";
import { t } from "../i18n/index.js";

export const MIN_NODE_MAJOR = 22;
export const REQUIRED_GLOBALS = ["fetch", "File", "FormData", "structuredClone"] as const;

export type RuntimeCheck = { ok: true; warning: string | null } | { ok: false; missing: string[] };

const parseNodeMajor = (nodeVersion: string) => {
  const match = /^v?(\d+)/.exec(nodeVersion.trim());
  return match ? Number.parseInt(match[1], 10) : null;
};

export const checkRuntime = (
  nodeVersion: string,
  globals: Record<string, unknown>,
): RuntimeCheck => {
  const missing = REQUIRED_GLOBALS.filter((name) => typeof globals[name] !== "function");
  if (missing.length > 0) {
    return { ok: false, missing: [...missing] };
  }

  const major = parseNodeMajor(nodeVersion);
  const warning =
    major !== null && major < MIN_NODE_MAJOR
      ? `Node.js ${nodeVersion} is below the supported version >=${MIN_NODE_MAJOR}.`
      : null;
  return { ok: true, warning };
};

export const assertRuntimeSupported = (): void => {
  const required = `>=${MIN_NODE_MAJOR}`;
  const result = checkRuntime(process.version, globalThis as unknown as Record<string, unknown>);
  if (!result.ok) {
    throw new CliError(
      "UNSUPPORTED_RUNTIME",
      t("cli.unsupported_runtime", {
        version: process.version,
        missing: result.missing.join(", "),
        required,
      }),
      2,
      { node: process.version, required, missing: result.missing },
    );
  }
  if (result.warning) {
    log(t("cli.node_version_warning", { version: process.version, required }));
  }
};
