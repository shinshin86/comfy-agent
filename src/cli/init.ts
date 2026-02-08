import { initWorkdir } from "../io/workdir.js";
import { print } from "../io/output.js";
import { t } from "../i18n/index.js";

export type InitOptions = {
  force?: boolean;
  global?: boolean;
};

export const runInit = async (options: InitOptions) => {
  const scope = options.global ? "global" : "local";
  const result = await initWorkdir({ force: options.force, scope });
  const scopeLabel = t(scope === "global" ? "scope.global" : "scope.local");
  if (result.created.length === 0) {
    print(t("init.already", { scope: scopeLabel }));
  } else {
    print(t("init.done", { scope: scopeLabel }));
  }
  print(t("init.next"));
};
