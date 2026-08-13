import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { workflowHasSubgraphs } from "../src/workflow/normalize.js";

const kitDir = path.join(process.cwd(), "scripts", "colab", "ltx25");

type UiNode = {
  id: number;
  type: string;
  properties?: { cnr_id?: string };
};

type UiWorkflow = {
  nodes: UiNode[];
  definitions: { subgraphs: Array<{ nodes: UiNode[] }> };
};

const readWorkflow = async (name: string) =>
  JSON.parse(await fs.readFile(path.join(kitDir, name), "utf-8")) as UiWorkflow;

const workflowSha256 = async (name: string) =>
  createHash("sha256")
    .update(await fs.readFile(path.join(kitDir, name)))
    .digest("hex");

describe("LTX-2.5 Colab kit", () => {
  it("records the completed A100 E2E verification", async () => {
    const readme = await fs.readFile(path.join(kitDir, "README.md"), "utf-8");

    expect(readme).toContain("Verified E2E on 2026-08-13");
    expect(readme).toContain("NVIDIA A100-SXM4-40GB");
    expect(readme).toContain("132.60 s (T2V)");
    expect(readme).toContain("117.90 s (I2V)");
    expect(readme).toContain("151.32 s (FLF2V)");
    expect(readme).toContain("1280x704");
    expect(readme).toContain("48 kHz");
  });

  it("pins ComfyUI, model repositories, workflow provenance, cloudflared, and asset sizes", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain('COMFYUI_REVISION = "c2bcbecd82ec5ae66594340b395c24ef0217b238"');
    expect(setup).toContain("COMFYUI_ARCHIVE_SIZE = 11781636");
    expect(setup).toContain(
      'COMFYUI_ARCHIVE_SHA256 = "9ed49823d5e2e4b42b54683d9677bb5f3e90f8386fb044d05439dcba2c3f981a"',
    );
    expect(setup).toContain("https://codeload.github.com/Comfy-Org/ComfyUI/tar.gz/");
    expect(setup).toContain('LTX25_REVISION = "28dac7acdc1f78a70e98687db261a949754f8941"');
    expect(setup).toContain('GEMMA4_REVISION = "fb53025d538a4d19de09e37d01ee49b41f18e486"');
    expect(setup).toContain('WORKFLOW_REVISION = "96a8cab7fa7b4c201910cd59cdd94dcc3c2d2deb"');
    expect(setup).toContain('CLOUDFLARED_VERSION = "2026.7.2"');
    expect(setup).toContain("21504034224");
    expect(setup).toContain("15372971786");
    expect(setup).toContain("10278774160");
    expect(setup).toContain("1472223346");
    expect(setup).toContain("364866540");
    expect(setup).toContain("995778752");
    expect(setup).not.toContain("releases/latest");
    expect(setup).not.toContain("custom_nodes");
  });

  it("reads the gated token through Colab Secrets without printing it", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain('userdata.get("HF_TOKEN")');
    expect(setup).toContain("token=hf_token if gated else None");
    expect(setup).not.toMatch(/print\([^\n]*hf_token/i);
  });

  it("bundles the three official native ComfyUI subgraph workflows", async () => {
    const t2v = await readWorkflow("video_ltx2_5_t2v.json");
    const i2v = await readWorkflow("video_ltx2_5_i2v.json");
    const flf2v = await readWorkflow("video_ltx2_5_flf2v.json");

    for (const workflow of [t2v, i2v, flf2v]) {
      expect(workflowHasSubgraphs(workflow)).toBe(true);
      const executableNodes = [
        ...workflow.nodes,
        ...workflow.definitions.subgraphs.flatMap((subgraph) => subgraph.nodes),
      ].filter((node) => node.type !== "MarkdownNote");
      expect(executableNodes.length).toBeGreaterThan(20);
      expect(executableNodes.every((node) => node.properties?.cnr_id === "comfy-core")).toBe(true);
      expect(executableNodes.some((node) => node.type === "SaveVideo")).toBe(true);
    }

    expect(t2v.nodes.some((node) => node.type === "LoadImage")).toBe(false);
    expect(i2v.nodes.filter((node) => node.type === "LoadImage")).toHaveLength(1);
    expect(flf2v.nodes.filter((node) => node.type === "LoadImage")).toHaveLength(2);
  });

  it("pins the official workflow files byte-for-byte", async () => {
    await expect(workflowSha256("video_ltx2_5_t2v.json")).resolves.toBe(
      "d59f23687bd0f4322f8e707897c2932bc9e3db286fff04c11f9278b1ca0d6ca5",
    );
    await expect(workflowSha256("video_ltx2_5_i2v.json")).resolves.toBe(
      "344c1ae143287f98266e648818c0ab1b68a5de76eb7601fd17df60989422eb60",
    );
    await expect(workflowSha256("video_ltx2_5_flf2v.json")).resolves.toBe(
      "aedf79e3077e917d731c594091c7f1afda425fe871f1b9a9094a19ec1b03125a",
    );
  });
});
