import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const kitDir = path.join(process.cwd(), "scripts", "colab", "minimax_h3");

type ApiNode = { class_type: string; inputs: Record<string, unknown> };

describe("MiniMax H3 Colab kit", () => {
  it("pins ComfyUI, model assets, cloudflared, sizes, and checksums", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain('COMFYUI_REVISION = "14b05228cef127ce529bc0c08660770d4af3e9a8"');
    expect(setup).toContain('MODEL_REVISION = "fd70b39279d1ae6eb214c903f53e1bec3af19a77"');
    expect(setup).toContain("20970379616");
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

  it("keeps geographic compliance as documentation, not a setup-time guard", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");
    const readme = await fs.readFile(path.join(kitDir, "README.md"), "utf-8");

    expect(readme).toContain("Applicable Territory");
    expect(readme).toContain("Colab runtime region");
    expect(readme).toContain("does not geolocate the user or block execution");
    expect(setup).not.toMatch(/ipinfo|geoip|geocoder|ip-api|country_code/i);
  });
});
