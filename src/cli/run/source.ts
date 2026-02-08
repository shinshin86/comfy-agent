import { CliError } from "../../io/errors.js";
import { t } from "../../i18n/index.js";
import type { RunSource } from "./types.js";

export const resolveRunSource = (source?: string): RunSource => {
  if (!source) return "auto";
  if (source === "local" || source === "remote" || source === "remote-catalog") return source;
  throw new CliError("INVALID_PARAM", t("run.invalid_source"), 2, { value: source });
};

export const selectRunSource = (
  requested: RunSource,
  hasLocal: boolean,
  hasRemote: boolean,
  hasRemoteCatalog: boolean,
): "local" | "remote" | "remote-catalog" => {
  if (requested === "local") {
    if (!hasLocal) throw new CliError("PRESET_NOT_FOUND", t("run.preset_not_found"), 2);
    return "local";
  }
  if (requested === "remote") {
    if (!hasRemote) throw new CliError("PRESET_NOT_FOUND", t("run.preset_not_found"), 2);
    return "remote";
  }
  if (requested === "remote-catalog") {
    if (!hasRemoteCatalog) throw new CliError("PRESET_NOT_FOUND", t("run.preset_not_found"), 2);
    return "remote-catalog";
  }
  if (hasLocal) return "local";
  if (hasRemote) return "remote";
  // auto mode intentionally does not select remote-catalog.
  throw new CliError("PRESET_NOT_FOUND", t("run.preset_not_found"), 2);
};

export const resolveSelectedRunSource = (
  requested: RunSource,
  hasLocal: boolean,
  hasRemote: boolean,
  hasRemoteCatalog: boolean,
  remoteError: unknown,
  remoteCatalogError: unknown,
): "local" | "remote" | "remote-catalog" => {
  try {
    return selectRunSource(requested, hasLocal, hasRemote, hasRemoteCatalog);
  } catch (err) {
    if (
      requested !== "local" &&
      requested !== "remote-catalog" &&
      remoteError &&
      err instanceof CliError &&
      err.code === "PRESET_NOT_FOUND"
    ) {
      throw remoteError;
    }
    if (
      requested === "remote-catalog" &&
      remoteCatalogError &&
      err instanceof CliError &&
      err.code === "PRESET_NOT_FOUND"
    ) {
      throw remoteCatalogError;
    }
    throw err;
  }
};
