import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComfyClient } from "../src/api/client.js";
import { getSubdirPath } from "../src/io/workdir.js";
import type { Preset } from "../src/preset/schema.js";
import { loadLocalWorkflow, resolveWorkflowPath } from "../src/workflow/load.js";

const roots = new Set<string>();
const preset: Preset = {
  version: 1,
  name: "example",
  workflow: "example.json",
};
const client = new ComfyClient("http://127.0.0.1:1");

const createTmpDir = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comfy-agent-workflow-load-"));
  roots.add(root);
  return root;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...roots].map((root) => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("workflow load", () => {
  it("resolves workflow path under global scope", () => {
    const cwd = path.join(os.tmpdir(), "workflow-path-cwd");

    expect(resolveWorkflowPath(preset, "global", cwd)).toBe(
      path.join(getSubdirPath("workflows", cwd, "global"), preset.workflow),
    );
  });

  it("throws FILE_NOT_FOUND with workflow details when the file is missing", async () => {
    const cwd = await createTmpDir();
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    const workflowPath = resolveWorkflowPath(preset, "local", cwd);

    await expect(loadLocalWorkflow(preset, "local", client)).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
      exitCode: 2,
      details: {
        path: workflowPath,
        preset: preset.name,
        scope: "local",
        kind: "workflow",
      },
    });
  });

  it("throws INVALID_WORKFLOW on broken JSON", async () => {
    const cwd = await createTmpDir();
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    const workflowPath = resolveWorkflowPath(preset, "local", cwd);
    await fs.mkdir(path.dirname(workflowPath), { recursive: true });
    await fs.writeFile(workflowPath, "{broken", "utf-8");

    await expect(loadLocalWorkflow(preset, "local", client)).rejects.toMatchObject({
      code: "INVALID_WORKFLOW",
      exitCode: 2,
      details: {
        file: workflowPath,
        cause: expect.stringContaining("SyntaxError"),
      },
    });
  });
});
