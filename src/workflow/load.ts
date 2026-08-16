import path from "node:path";
import { promises as fs } from "node:fs";
import { ComfyClient } from "../api/client.js";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { getSubdirPath, type WorkdirScope } from "../io/workdir.js";
import type { Preset } from "../preset/schema.js";
import {
  normalizeWorkflow,
  workflowHasSubgraphs,
  type Workflow,
  type WorkflowObjectInfo,
} from "./normalize.js";

export const resolveWorkflowPath = (preset: Preset, scope: WorkdirScope, cwd = process.cwd()) =>
  path.join(getSubdirPath("workflows", cwd, scope), preset.workflow);

export const loadLocalWorkflow = async (
  preset: Preset,
  scope: WorkdirScope,
  client: ComfyClient,
): Promise<{ workflow: Workflow; workflowPath: string; hadSubgraphs: boolean }> => {
  const workflowPath = resolveWorkflowPath(preset, scope);
  let raw: string;
  try {
    raw = await fs.readFile(workflowPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError(
        "FILE_NOT_FOUND",
        t("run.workflow_not_found", {
          file: preset.workflow,
          preset: preset.name,
          scope,
        }),
        2,
        {
          path: workflowPath,
          preset: preset.name,
          scope,
          kind: "workflow",
        },
      );
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new CliError("INVALID_WORKFLOW", t("run.invalid_workflow_json"), 2, {
      file: workflowPath,
      cause: String(err),
    });
  }

  const hadSubgraphs = workflowHasSubgraphs(parsed);
  const objectInfo = hadSubgraphs ? await client.objectInfo<WorkflowObjectInfo>() : null;
  try {
    return {
      workflow: normalizeWorkflow(parsed, { objectInfo }),
      workflowPath,
      hadSubgraphs,
    };
  } catch (err) {
    throw new CliError("INVALID_WORKFLOW", (err as Error).message, 2, { file: workflowPath });
  }
};
