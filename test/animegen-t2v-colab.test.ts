import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const kitDir = path.join(process.cwd(), "scripts", "colab", "animegen_t2v");

describe("AnimeGen-T2V Colab kit", () => {
  it("uses the Xet-aware Hub client with pinned model revisions", async () => {
    const setup = await fs.readFile(path.join(kitDir, "01_setup.py"), "utf-8");

    expect(setup).toContain("hf_hub_download");
    expect(setup).toContain('ANIMEGEN_REPO = "aidealab/AnimeGen-T2V"');
    expect(setup).toContain('ANIMEGEN_REVISION = "ea04305bca418d988e4924a92a1e8ff67cb29a68"');
    expect(setup).not.toContain("aria2c");
  });

  it("provides plain and Lightning dual-expert workflows", async () => {
    const plain = JSON.parse(
      await fs.readFile(path.join(kitDir, "animegen_t2v.json"), "utf-8"),
    ) as Record<string, { class_type: string }>;
    const lightning = JSON.parse(
      await fs.readFile(path.join(kitDir, "animegen_t2v_lightning.json"), "utf-8"),
    ) as Record<string, { class_type: string }>;

    expect(plain["37"].class_type).toBe("UNETLoader");
    expect(plain["56"].class_type).toBe("UNETLoader");
    expect(lightning["40"].class_type).toBe("LoraLoaderModelOnly");
    expect(lightning["41"].class_type).toBe("LoraLoaderModelOnly");
  });

  it("records the verified Lightning E2E path", async () => {
    const readme = await fs.readFile(path.join(kitDir, "README.md"), "utf-8");

    expect(readme).toContain("Verified E2E on Colab A100");
    expect(readme).toContain("no custom node or repack is required");
  });
});
