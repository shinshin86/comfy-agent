import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const kitDir = path.join(process.cwd(), "scripts", "colab", "10eros_max");

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

describe("10Eros-Max Colab kit", () => {
  it("pins the INT8 conversion, H3 support assets, ComfyUI, and cloudflared", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain("UPDATE_COMFYUI = False");
    expect(setup).toContain('COMFYUI_REVISION = "14b05228cef127ce529bc0c08660770d4af3e9a8"');
    expect(setup).toContain('BASE_MODEL_REVISION = "fd70b39279d1ae6eb214c903f53e1bec3af19a77"');
    expect(setup).toContain('EROS_MODEL_REVISION = "a563c82845b456e7e7c7f284a2d9644c2dd968cc"');
    expect(setup).toContain("20197375168");
    expect(setup).toContain("b158940fedae336085b322e5a0de93e6294e63713b4ee174d39b32550d9692da");
    expect(setup).toContain("15687142551");
    expect(setup).toContain("5207808496");
    expect(setup).toContain("605254808");
    expect(setup).toContain('CLOUDFLARED_VERSION = "2026.7.2"');
    expect(setup).not.toContain("releases/latest");
    expect(setup).not.toContain("custom_nodes");
  });

  it("provides native H3 T2V and I2V workflows using the non-Turbo FL2VA model", async () => {
    const t2v = JSON.parse(
      await fs.readFile(path.join(kitDir, "10eros_max_t2v.json"), "utf-8"),
    ) as Workflow;
    const i2v = JSON.parse(
      await fs.readFile(path.join(kitDir, "10eros_max_i2v.json"), "utf-8"),
    ) as Workflow;

    for (const workflow of [t2v, i2v]) {
      expect(workflow["6"]).toMatchObject({
        class_type: "UNETLoader",
        inputs: {
          unet_name: "10Eros_Max_h3_fl2va_beta2_pruned_int8_convrot.safetensors",
        },
      });
      expect(workflow["9"]).toMatchObject({
        class_type: "BasicScheduler",
        inputs: { scheduler: "simple", steps: 20, denoise: 1 },
      });
      expect(workflow["17"]).toMatchObject({
        class_type: "KSamplerSelect",
        inputs: { sampler_name: "res_multistep" },
      });
      expect(workflow["104"]).toMatchObject({
        class_type: "MiniMaxH3ImageToVideo",
        inputs: { width: 864, height: 480, length: 124 },
      });
      expect(workflow["104"].inputs.prompt).toEqual(expect.stringContaining("overall_soundscape:"));
      expect(workflow["104"].inputs.prompt).toEqual(expect.stringContaining("non_diegetic_music:"));
      expect(workflow["91"]).toMatchObject({
        class_type: "CreateVideo",
        inputs: { images: ["10", 0], audio: ["23", 0], fps: 24 },
      });
    }

    expect(t2v["104"].inputs).not.toHaveProperty("first_frame");
    expect(i2v["114"]).toMatchObject({
      class_type: "LoadImage",
      inputs: { image: "input.png" },
    });
    expect(i2v["104"].inputs.first_frame).toEqual(["114", 0]);
    expect(i2v["104"].inputs.prompt).toEqual(expect.stringContaining("<Picture 1>"));
  });

  it("keeps the kit at Starter and documents inherited licenses and runtime-region risk", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");
    const readme = await fs.readFile(path.join(kitDir, "README.md"), "utf-8");

    expect(readme).toContain("> **Status: Starter.**");
    expect(readme).toContain("Applicable Territory");
    expect(readme).toContain("Colab runtime region");
    expect(readme).toContain("LTX-2.3, Wan 2.2, and Krea 2");
    expect(setup).not.toMatch(/ipinfo|geoip|geocoder|ip-api|country_code/i);
  });
});
