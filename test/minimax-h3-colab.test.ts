import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const kitDir = path.join(process.cwd(), "scripts", "colab", "minimax_h3");

type ApiNode = { class_type: string; inputs: Record<string, unknown> };

describe("MiniMax H3 Colab kit", () => {
  it("pins ComfyUI, model assets, cloudflared, sizes, and checksums", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain('COMFYUI_REVISION = "e01fb4c56b7a88149d469b99cbbfe3223d715054"');
    expect(setup).toContain('MODEL_REVISION = "4cc1d817b6184899b41293954329f576cb5ae86b"');
    expect(setup).toContain("DOWNLOAD_FL2VA = True");
    expect(setup).toContain("DOWNLOAD_REF2VA = False");
    expect(setup).toContain("DOWNLOAD_REF2V_TURBO_LORA = False");
    expect(setup).toContain("20970379616");
    expect(setup).toContain("9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779");
    expect(setup).toContain("1956193000");
    expect(setup).toContain("5b9ab5ade15d0775676d01a907268a69a1468dc6033b3b0d3ded5502f3ebb84c");
    expect(setup).toContain("15687142551");
    expect(setup).toContain("5207808496");
    expect(setup).toContain("605254808");
    expect(setup).toContain("expected_sha256");
    expect(setup).toContain('CLOUDFLARED_VERSION = "2026.7.2"');
  });

  it("provides T2V and I2V workflows with shared native AV sampling", async () => {
    const t2v = JSON.parse(
      await fs.readFile(path.join(kitDir, "minimax_h3_t2v.json"), "utf-8"),
    ) as Record<string, ApiNode>;
    const i2v = JSON.parse(
      await fs.readFile(path.join(kitDir, "minimax_h3_i2v.json"), "utf-8"),
    ) as Record<string, ApiNode>;

    for (const workflow of [t2v, i2v]) {
      expect(workflow["104"]).toMatchObject({
        class_type: "MiniMaxH3ImageToVideo",
        inputs: { width: 864, height: 480, length: 124 },
      });
      expect(workflow["14"]).toMatchObject({
        class_type: "SamplerCustomAdvanced",
        inputs: { latent_image: ["104", 1] },
      });
      expect(workflow["91"]).toMatchObject({
        class_type: "CreateVideo",
        inputs: { images: ["10", 0], audio: ["23", 0], fps: 24 },
      });
      expect(workflow["92"]).toMatchObject({
        class_type: "SaveVideo",
        inputs: { video: ["91", 0] },
      });
    }

    expect(t2v["104"].inputs).not.toHaveProperty("first_frame");
    expect(i2v["114"]).toMatchObject({
      class_type: "LoadImage",
      inputs: { image: "input.png" },
    });
    expect(i2v["104"].inputs.first_frame).toEqual(["114", 0]);
  });

  it("provides an R2V workflow with image and audio references plus native AV output", async () => {
    const r2v = JSON.parse(
      await fs.readFile(path.join(kitDir, "minimax_h3_r2v.json"), "utf-8"),
    ) as Record<string, ApiNode>;

    expect(r2v["6"]).toMatchObject({
      class_type: "UNETLoader",
      inputs: { unet_name: "minimax_h3_ref2va_pruned_int8_convrot.safetensors" },
    });
    expect(r2v["104"]).toMatchObject({
      class_type: "MiniMaxH3ReferenceToVideo",
      inputs: {
        audio_vae: ["24", 0],
        "ref_images.ref_image_0": ["114", 0],
        "ref_audios.ref_audio_0": ["115", 0],
        width: 864,
        height: 480,
        length: 124,
        ref_image_size: "match",
      },
    });
    expect(r2v["114"]).toMatchObject({
      class_type: "LoadImage",
      inputs: { image: "input.png" },
    });
    expect(r2v["115"]).toMatchObject({
      class_type: "LoadAudio",
      inputs: { audio: "input.wav" },
    });
    expect(r2v["14"]).toMatchObject({
      class_type: "SamplerCustomAdvanced",
      inputs: { latent_image: ["104", 1] },
    });
    expect(r2v["91"]).toMatchObject({
      class_type: "CreateVideo",
      inputs: { images: ["10", 0], audio: ["23", 0], fps: 24 },
    });
    expect(r2v["92"]).toMatchObject({
      class_type: "SaveVideo",
      inputs: { video: ["91", 0] },
    });
    expect(Object.values(r2v).filter((node) => node.class_type === "LoadImage")).toHaveLength(1);
    expect(Object.values(r2v).filter((node) => node.class_type === "LoadAudio")).toHaveLength(1);
  });

  it("keeps geographic compliance as documentation, not a setup-time guard", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");
    const readme = await fs.readFile(path.join(kitDir, "README.md"), "utf-8");

    expect(readme).toContain("Applicable Territory");
    expect(readme).toContain("Colab runtime region");
    expect(readme).toContain("does not geolocate the user or block execution");
    expect(setup).not.toMatch(/ipinfo|geoip|geocoder|ip-api|country_code/i);
  });
});
