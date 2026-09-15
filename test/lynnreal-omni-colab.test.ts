import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { runColabKit } from "../src/cli/colab.js";
import { PresetSchema } from "../src/preset/schema.js";
import { buildColabSuggestPayload, loadColabCatalogFile } from "../src/colab/catalog.js";

const kitDir = path.join(process.cwd(), "scripts/colab/lynnreal_omni");
type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

describe("LynnReal-Omni Standard INT8 kit", () => {
  it("selects LynnReal explicitly without changing ordinary H3 routing", async () => {
    const catalog = await loadColabCatalogFile("scripts/colab/catalog.yaml");
    const selected = buildColabSuggestPayload(catalog, {
      goal: "LynnReal Omni text to video",
      gpu: "A100",
    });
    expect(selected.suggestions[0].kit).toBe("lynnreal_omni");
    expect(buildColabSuggestPayload(catalog, { goal: "H3" }).suggestions[0].workflow).toBe(
      "minimax_h3_t2v",
    );
  });

  it("uses the dedicated offload launcher", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const payload = await runColabKit("lynnreal_omni", { json: true });
      expect(payload.paths.launcher).toBe(path.join(kitDir, "02_start_comfyui.py"));
    } finally {
      spy.mockRestore();
    }
  });

  it.each(["t2v", "i2v"])(
    "imports %s with the upstream Standard schedule and AV outputs",
    async (mode) => {
      const name = `lynnreal_omni_${mode}`;
      const graph: Graph = JSON.parse(await fs.readFile(path.join(kitDir, `${name}.json`), "utf8"));
      for (const node of Object.values(graph))
        for (const input of Object.values(node.inputs))
          if (Array.isArray(input)) expect(graph[input[0]]).toBeDefined();
      expect(graph["6"].inputs.unet_name).toBe("lynnreal_omni_standard_int8.safetensors");
      expect(graph["9"].inputs).toMatchObject({ model: ["6", 0], steps: 4, scheduler: "simple" });
      expect(graph["16"].inputs.model).toEqual(["6", 0]);
      expect(graph["17"].inputs.sampler_name).toBe("euler");
      expect(Object.values(graph).some((n) => /Lora|Shift|Switch/.test(n.class_type))).toBe(false);
      expect(graph["91"].inputs).toMatchObject({ images: ["10", 0], audio: ["23", 0], fps: 24 });
      const preset = PresetSchema.parse(buildPresetTemplate(name, `${name}.json`, graph, null));
      expect(Object.values(preset.uploads ?? {}).map((u) => u.cli_flag)).toEqual(
        mode === "i2v" ? ["--image"] : [],
      );
    },
  );

  it("parses setup and launcher without running them", () => {
    execFileSync("python3", [
      "-c",
      "import ast,pathlib,sys; [ast.parse(p.read_text()) for p in pathlib.Path(sys.argv[1]).glob('*.py')]",
      kitDir,
    ]);
  });

  it("resumes an aria2 partial file even when its logical size is complete", () => {
    execFileSync("python3", [
      "-c",
      `
import ast, hashlib, os, pathlib, sys, tempfile, time
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
functions = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)], type_ignores=[])
namespace = {'hashlib': hashlib, 'os': os, 'time': time}
exec(compile(functions, '<download helpers>', 'exec'), namespace)
with tempfile.TemporaryDirectory() as tmp:
    target = pathlib.Path(tmp) / 'model.safetensors'
    control = pathlib.Path(str(target) + '.aria2')
    target.write_bytes(b'0000')
    control.write_bytes(b'partial')
    calls = []
    def download(*args):
        assert target.read_bytes() == b'0000', 'partial file was deleted'
        assert control.exists(), 'resume map was deleted'
        calls.append(args)
        target.write_bytes(b'done')
        control.unlink()
    namespace['run'] = download
    ensure = namespace['ensure_download']
    digest = hashlib.sha256(b'done').hexdigest()
    ensure('https://example.invalid/model', str(target), 4, digest)
    ensure('https://example.invalid/model', str(target), 4, digest)
    assert len(calls) == 1, 'verified file should be reused'
`,
      path.join(kitDir, "01_setup.py"),
    ]);
  });
});
