import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadColabCatalogFile } from "../src/colab/catalog.js";
import { buildPresetTemplate } from "../src/cli/import.js";

const colabDir = path.join(process.cwd(), "scripts", "colab");
const kitDir = path.join(colabDir, "krea2_h3");

const readWorkflow = async (file: string) =>
  JSON.parse(await fs.readFile(path.join(kitDir, file), "utf-8")) as Record<string, unknown>;

const buildPreset = async (name: string, file: string) =>
  buildPresetTemplate(name, file, await readWorkflow(file), null);

const extractConstant = (source: string, name: string) =>
  source.match(new RegExp(`^${name} = "([^"]+)"$`, "m"))?.[1];

describe("Krea 2 + MiniMax H3 combo Colab kit", () => {
  it("pins ComfyUI, model assets, cloudflared, sizes, and checksums", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain('COMFYUI_REVISION = "e01fb4c56b7a88149d469b99cbbfe3223d715054"');
    expect(setup).toContain('H3_MODEL_REVISION = "4cc1d817b6184899b41293954329f576cb5ae86b"');
    expect(setup).toContain('KREA2_MODEL_REVISION = "e5ea8b4dd7f38f348b138eb0fe29f92c0e367e96"');
    expect(setup).toContain('CLOUDFLARED_VERSION = "2026.7.2"');
    expect(setup).toContain("88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a");
    expect(setup).toContain("18887572");
    expect(setup).toContain("DOWNLOAD_FL2VA = True");
    expect(setup).toContain("DOWNLOAD_REF2VA = True");

    const assets = [
      ["13141730784", "eb4dd8c612cfd10f64f25b057e6e6bbcb5737c94a7372177e456dbf7579502f1"],
      ["5242467968", "54bd5144df0bbc25dd6ccadfcb826b521445a1b06ae5a42570bdd2974ca87094"],
      ["253806246", "a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f"],
      ["20970379616", "e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a"],
      ["20970379616", "9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779"],
      ["15687142551", "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6"],
      ["5207808496", "7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522"],
      ["605254808", "8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48"],
    ];
    for (const [size, sha256] of assets) {
      expect(setup).toContain(size);
      expect(setup).toContain(sha256);
    }

    expect(setup).toContain("expected_sha256");
    expect(setup).not.toContain("--index-url https://download.pytorch.org");
    expect(setup).not.toContain("ComfyUI-Manager");
  });

  it("uses the same ComfyUI and H3 model revisions as the MiniMax H3 kit", async () => {
    const comboSetup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");
    const h3Setup = await fs.readFile(path.join(colabDir, "minimax_h3", "01_setup.py"), "utf-8");

    expect(extractConstant(comboSetup, "COMFYUI_REVISION")).toBe(
      extractConstant(h3Setup, "COMFYUI_REVISION"),
    );
    expect(extractConstant(comboSetup, "H3_MODEL_REVISION")).toBe(
      extractConstant(h3Setup, "MODEL_REVISION"),
    );
  });

  it("keeps all three workflows byte-identical to their source kits", async () => {
    const copies = [
      ["krea2_turbo.json", path.join(colabDir, "krea2", "krea2_turbo.json")],
      ["minimax_h3_i2v.json", path.join(colabDir, "minimax_h3", "minimax_h3_i2v.json")],
      ["minimax_h3_r2v.json", path.join(colabDir, "minimax_h3", "minimax_h3_r2v.json")],
    ];

    for (const [file, source] of copies) {
      expect(await fs.readFile(path.join(kitDir, file))).toEqual(await fs.readFile(source));
    }
  });

  it("imports the keyframe, I2V, and R2V workflows with stable flags and seed roles", async () => {
    const keyframe = await buildPreset("k2h3_keyframe", "krea2_turbo.json");
    expect(keyframe.uploads).toBeUndefined();
    expect(keyframe.parameters?.["11_text"]?.aliases).toEqual(["prompt"]);
    expect(keyframe.parameters?.["19_steps"]?.aliases).toEqual(["steps"]);
    expect(keyframe.parameters?.["19_cfg"]?.aliases).toEqual(["cfg"]);
    expect(keyframe.parameters?.["28_width"]?.aliases).toEqual(["width"]);
    expect(keyframe.parameters?.["28_height"]?.aliases).toEqual(["height"]);
    expect(keyframe.parameters?.["19_seed"]?.role).toBe("seed");

    const i2v = await buildPreset("k2h3_i2v", "minimax_h3_i2v.json");
    expect(i2v.uploads).toMatchObject({
      image: { cli_flag: "--image", target: { node_id: "114", input: "image" } },
    });
    expect(i2v.parameters?.["104_prompt"]?.aliases).toEqual(["prompt"]);
    expect(i2v.parameters?.["104_width"]?.aliases).toEqual(["width"]);
    expect(i2v.parameters?.["104_height"]?.aliases).toEqual(["height"]);
    expect(i2v.parameters?.["104_length"]?.aliases).toEqual(["length"]);
    expect(i2v.parameters?.["15_noise_seed"]?.role).toBe("seed");

    const r2v = await buildPreset("k2h3_r2v", "minimax_h3_r2v.json");
    expect(r2v.uploads).toMatchObject({
      image: { cli_flag: "--image", target: { node_id: "114", input: "image" } },
      audio: { cli_flag: "--audio", target: { node_id: "115", input: "audio" } },
    });
    expect(r2v.parameters?.["104_prompt"]?.aliases).toEqual(["prompt"]);
    expect(r2v.parameters?.["104_width"]?.aliases).toEqual(["width"]);
    expect(r2v.parameters?.["104_height"]?.aliases).toEqual(["height"]);
    expect(r2v.parameters?.["104_length"]?.aliases).toEqual(["length"]);
    expect(r2v.parameters?.["15_noise_seed"]?.role).toBe("seed");
  });

  it("registers the verified combo kit and returns sorted workflows", async () => {
    const catalog = await loadColabCatalogFile(path.join(colabDir, "catalog.yaml"));
    const kit = catalog.kits.find((entry) => entry.name === "krea2_h3");

    expect(kit).toMatchObject({
      status: "verified",
      tasks: ["text_to_image", "image_to_video"],
      outputs: ["image", "video"],
      gpu: { minimum: "A100", recommended: "A100" },
      composable: false,
    });
    expect(kit?.workflows.map((workflow) => workflow.name)).toEqual([
      "k2h3_i2v",
      "k2h3_keyframe",
      "k2h3_r2v",
    ]);
  });
});
