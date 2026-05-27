import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { buildColabCatalogPayload, loadColabCatalogFile } from "../colab/catalog.js";

export type ColabCatalogOptions = {
  json?: boolean;
};

export const runColabCatalog = async (options: ColabCatalogOptions) => {
  const catalog = await loadColabCatalogFile();
  const payload = buildColabCatalogPayload(catalog);

  if (options.json) {
    printJson(payload);
    return;
  }

  print(t("colab.catalog_header"));
  for (const kit of payload.catalog.kits) {
    print(
      `- ${kit.name}: ${kit.tasks.join(",")} -> ${kit.outputs.join(",")} (${kit.status}, GPU: ${
        kit.gpu.recommended ?? kit.gpu.minimum ?? "unknown"
      })`,
    );
  }
};
