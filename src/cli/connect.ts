import { ComfyClient } from "../api/client.js";
import { CliError } from "../io/errors.js";
import { log, print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { writeConfig } from "../io/config.js";
import type { WorkdirScope } from "../io/workdir.js";

export type ConnectOptions = {
  json?: boolean;
  global?: boolean;
  force?: boolean;
};

const normalizeUrl = (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new CliError("INVALID_PARAM", t("connect.invalid_url", { url: rawUrl }), 2, {
      url: rawUrl,
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CliError("INVALID_PARAM", t("connect.invalid_url", { url: rawUrl }), 2, {
      url: rawUrl,
    });
  }
  return parsed.toString().replace(/\/$/, "");
};

export const runConnect = async (rawUrl: string, options: ConnectOptions) => {
  const scope: WorkdirScope = options.global ? "global" : "local";
  const baseUrl = normalizeUrl(rawUrl);

  let reachable = true;
  let reachError: string | null = null;
  try {
    const client = new ComfyClient(baseUrl);
    await client.queue();
  } catch (err) {
    reachable = false;
    reachError = err instanceof Error ? err.message : String(err);
  }

  if (!reachable && !options.force) {
    throw new CliError("SERVER_UNREACHABLE", t("connect.unreachable", { url: baseUrl }), 3, {
      server: baseUrl,
      cause: reachError,
    });
  }

  const savedTo = await writeConfig({ version: 1, base_url: baseUrl }, process.cwd(), scope);

  if (options.json) {
    printJson({
      ok: true,
      base_url: baseUrl,
      connection: reachable ? "OK" : "UNVERIFIED",
      saved_to: savedTo,
      scope,
    });
    return;
  }

  if (reachable) {
    print(t("connect.ok", { url: baseUrl }));
  } else {
    log(t("connect.saved_unverified", { url: baseUrl }));
  }
  print(t("connect.saved_to", { path: savedTo }));
};
