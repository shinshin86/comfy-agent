import { getWorkdirPath, initWorkdir, type InitResult, type WorkdirScope } from "../io/workdir.js";
import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";

export type InitOptions = {
  force?: boolean;
  global?: boolean;
  json?: boolean;
};

export const buildInitPayload = (scope: WorkdirScope, result: InitResult) => ({
  ok: true as const,
  scope,
  workdir: getWorkdirPath(process.cwd(), scope),
  created: result.created,
  skipped: result.skipped,
  already_initialized: result.created.length === 0,
});

export const runInit = async (options: InitOptions) => {
  const scope = options.global ? "global" : "local";
  const result = await initWorkdir({ force: options.force, scope });
  if (options.json) {
    printJson(buildInitPayload(scope, result));
    return;
  }
  const scopeLabel = t(scope === "global" ? "scope.global" : "scope.local");
  if (result.created.length === 0) {
    print(t("init.already", { scope: scopeLabel }));
  } else {
    print(t("init.done", { scope: scopeLabel }));
  }
  print(t("init.next"));
};
