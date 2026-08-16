import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  RESOURCES,
  readResource,
  resolvePackageRoot,
  resourceExists,
  resourcePath,
} from "../src/io/resources.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const originalRoot = process.env.COMFY_AGENT_RESOURCE_ROOT;

afterEach(() => {
  if (originalRoot === undefined) delete process.env.COMFY_AGENT_RESOURCE_ROOT;
  else process.env.COMFY_AGENT_RESOURCE_ROOT = originalRoot;
});

describe("bundled resource resolution", () => {
  it("finds the comfy-agent package root from source modules", async () => {
    const root = resolvePackageRoot();
    expect(JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf-8"))).toMatchObject({
      name: "comfy-agent",
    });
    await expect(fs.stat(resourcePath(RESOURCES.catalog))).resolves.toBeDefined();
  });

  it("honors COMFY_AGENT_RESOURCE_ROOT", async () => {
    const tmp = await createTmpWorkdir();
    const root = path.join(tmp.root, "package");
    await fs.mkdir(path.join(root, "docs"), { recursive: true });
    await fs.writeFile(path.join(root, "package.json"), '{"name":"comfy-agent"}\n');
    await fs.writeFile(path.join(root, "docs", "sample.md"), "sample\n");
    process.env.COMFY_AGENT_RESOURCE_ROOT = root;

    expect(resolvePackageRoot()).toBe(root);
    await expect(readResource("docs/sample.md")).resolves.toBe("sample\n");
    await expect(resourceExists("docs/sample.md")).resolves.toBe(true);
    await expect(resourceExists("docs/missing.md")).resolves.toBe(false);
  });

  it("reports an invalid override as a missing package root", async () => {
    const tmp = await createTmpWorkdir();
    process.env.COMFY_AGENT_RESOURCE_ROOT = tmp.root;
    expect(() => resolvePackageRoot()).toThrowError(
      expect.objectContaining({
        code: "RESOURCE_NOT_FOUND",
        exitCode: 2,
        details: { resource: "package_root", path: tmp.root },
      }),
    );
  });

  it("reports a missing bundled file with its resource name", async () => {
    await expect(readResource("docs/not-bundled.md")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      exitCode: 2,
      details: { resource: "docs/not-bundled.md" },
    });
  });
});
