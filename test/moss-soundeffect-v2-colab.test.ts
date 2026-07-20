import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const kitDir = path.join(process.cwd(), "scripts", "colab", "moss_soundeffect_v2");

describe("MOSS-SoundEffect v2.0 Colab kit", () => {
  it("targets the pinned v2.0 model rather than the legacy model", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain('MODEL_ID = "OpenMOSS-Team/MOSS-SoundEffect-v2.0"');
    expect(setup).toContain("MossSoundEffectPipeline");
    expect(setup).toContain('VENV_DIR = "/content/moss-soundeffect-v2-venv"');
    expect(setup).not.toMatch(/MODEL_ID = ["']OpenMOSS-Team\/MOSS-SoundEffect["']/);
  });

  it("connects the custom v2 node to a lossless ComfyUI audio output", async () => {
    const raw = await fs.readFile(path.join(kitDir, "moss_soundeffect_v2_t2a.json"), "utf-8");
    const workflow = JSON.parse(raw) as Record<
      string,
      { class_type: string; inputs: Record<string, unknown> }
    >;

    expect(workflow["1"]).toMatchObject({
      class_type: "MossSoundEffectV2",
      inputs: { seconds: 5, steps: 100, cfg_scale: 4, sigma_shift: 5 },
    });
    expect(workflow["2"]).toMatchObject({
      class_type: "SaveAudio",
      inputs: { audio: ["1", 0] },
    });
  });
});
