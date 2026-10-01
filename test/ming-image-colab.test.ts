import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPresetTemplate } from "../src/cli/import.js";
import { applySeedValue, resolveSeedTargets } from "../src/cli/run/args.js";
import { buildColabSuggestPayload, loadColabCatalogFile } from "../src/colab/catalog.js";
import { PresetSchema } from "../src/preset/schema.js";
import { normalizeWorkflow } from "../src/workflow/normalize.js";
import { applyParameters } from "../src/workflow/patch.js";

const kitDir = path.join(process.cwd(), "scripts/colab/ming_image");

describe("Ming-Image Design Colab kit", () => {
  it("routes the requested model with default weights and measured A100 verification", async () => {
    const catalog = await loadColabCatalogFile("scripts/colab/catalog.yaml");
    const result = buildColabSuggestPayload(catalog, {
      goal: "Ming-Image-0.1-Design",
      gpu: "A100",
    });
    expect(result.suggestions[0]).toMatchObject({
      kit: "ming_image",
      workflow: "ming_image_design_t2i",
      status: "partial",
      composable: false,
      gpu: { minimum: "A100", recommended: "A100", verified: ["A100"] },
    });
    expect(result.suggestions[0].gpu.verified).toEqual(["A100"]);
    // The CLI rounds catalog download estimates to one decimal place.
    expect(result.suggestions[0].download_gb).toBe(25.9);
  });

  it("imports and patches Japanese JSON, shared canvas dimensions and RandomNoise seed", async () => {
    const graph = normalizeWorkflow(
      JSON.parse(await fs.readFile(path.join(kitDir, "ming_image_design_t2i.json"), "utf8")),
    );
    const preset = PresetSchema.parse(
      buildPresetTemplate("ming_image_design_t2i", "ming_image_design_t2i.json", graph, null),
    );
    const aliases = Object.fromEntries(
      Object.entries(preset.parameters ?? {}).flatMap(([key, parameter]) =>
        (parameter.aliases ?? []).map((alias) => [alias, key]),
      ),
    );
    expect(Object.keys(aliases).sort()).toEqual(["height", "prompt", "steps", "width"]);
    const prompt = JSON.stringify({
      canvas_settings: { aspect_ratio: "16:9", ambient_lighting: "even", image_style: "poster" },
      layers: [
        {
          description: '見出し「夏のイラスト展」 / "SUMMER DAYS"\n女性のイラスト',
          coordinates: "cx: 0.500, cy: 0.500, w: 1.000, h: 1.000",
          hierarchy_and_relation: "foreground",
          color_specs: ["#FFFFFF"],
        },
      ],
    });
    const values = applySeedValue(
      {
        [aliases.prompt]: prompt,
        [aliases.width]: 2560,
        [aliases.height]: 1440,
        [aliases.steps]: 12,
      },
      resolveSeedTargets(preset),
      12345,
    );
    const patched = applyParameters(graph, preset, values) as Record<
      string,
      { inputs: Record<string, unknown> }
    >;
    expect(patched["4"].inputs.text).toBe(prompt);
    expect(patched["5"].inputs.value).toBe(2560);
    expect(patched["6"].inputs.value).toBe(1440);
    for (const id of ["7", "8"]) {
      expect(patched[id].inputs.width).toEqual(["5", 0]);
      expect(patched[id].inputs.height).toEqual(["6", 0]);
    }
    expect(patched["12"].inputs.noise_seed).toBe(12345);
    expect(patched["15"].inputs.images).toEqual(["14", 0]);
    for (const value of Object.values(graph)) {
      for (const input of Object.values((value as { inputs: Record<string, unknown> }).inputs)) {
        if (Array.isArray(input)) expect(graph[String(input[0])]).toBeDefined();
      }
    }
  });

  it("stops before downloads on insufficient resources and preserves mismatched files", () => {
    execFileSync("python3", [
      "-B",
      "-c",
      `
import ast, hashlib, pathlib, sys, tempfile
source = pathlib.Path(sys.argv[1]).read_text()
tree = ast.parse(source)
helpers = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name != 'main'], type_ignores=[])
calls = []
ns = {'hashlib': hashlib, 'Path': pathlib.Path}
exec(compile(helpers, '<setup helpers>', 'exec'), ns)
ns['run'] = lambda *args: calls.append(args)
gib = 1024**3
check = ns['check_resources']
check(40*gib, 64*gib, 60_000_000_000, 25_936_727_174)
for values in [(24*gib, 64*gib, 60_000_000_000, 0), (40*gib, 16*gib, 60_000_000_000, 0), (40*gib, 64*gib, 10_000_000_000, 0)]:
    try: check(*values)
    except RuntimeError: pass
    else: raise AssertionError('resource guard accepted insufficient resources')
with tempfile.TemporaryDirectory() as tmp:
    target = pathlib.Path(tmp) / 'model.safetensors'
    target.write_bytes(b'bad')
    try: ns['ensure_download']('https://example.invalid/model', str(target), 4, hashlib.sha256(b'good').hexdigest())
    except RuntimeError: pass
    else: raise AssertionError('mismatched file accepted')
    assert target.read_bytes() == b'bad' and calls == []
    target.write_bytes(b'good')
    ns['ensure_download']('https://example.invalid/model', str(target), 4, hashlib.sha256(b'good').hexdigest())
    assert calls == []
    resumed = pathlib.Path(tmp) / 'resumed.safetensors'
    partial = pathlib.Path(str(resumed) + '.part')
    partial.write_bytes(b'go')
    def download(*args):
        assert args[:3] == ('wget', '-c', '-O')
        assert partial.read_bytes() == b'go' and not resumed.exists()
        partial.write_bytes(b'good'); calls.append(args)
    ns['run'] = download
    ns['ensure_download']('https://example.invalid/model', str(resumed), 4, hashlib.sha256(b'good').hexdigest())
    assert resumed.read_bytes() == b'good' and not partial.exists() and len(calls) == 1
`,
      path.join(kitDir, "01_setup.py"),
    ]);
  });

  it("checks actual PNG pixels with every filter and rejects opaque, empty and corrupt output", () => {
    execFileSync("python3", [
      "-B",
      "-c",
      `
import importlib.util, json, pathlib, struct, subprocess, sys, tempfile, zlib
spec = importlib.util.spec_from_file_location('alpha', sys.argv[1])
alpha = importlib.util.module_from_spec(spec); spec.loader.exec_module(alpha)
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
def png(rows, filter_type=0, color=6):
    channels = 4 if color == 6 else 3
    encoded = bytearray(); previous = bytes(len(rows[0]))
    def predictor(a,b,c):
        p = a+b-c
        if abs(p-a) <= abs(p-b) and abs(p-a) <= abs(p-c): return a
        return b if abs(p-b) <= abs(p-c) else c
    for row in rows:
        encoded.append(filter_type)
        for x, value in enumerate(row):
            left = row[x-channels] if x >= channels else 0
            up = previous[x]; corner = previous[x-channels] if x >= channels else 0
            offset = [0, left, up, (left+up)//2, predictor(left, up, corner)][filter_type]
            encoded.append((value-offset) & 255)
        previous = row
    header = struct.pack('>IIBBBBB', len(rows[0])//channels, len(rows), 8, color, 0, 0, 0)
    return b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(encoded)) + chunk(b'IEND', b'')
with tempfile.TemporaryDirectory() as tmp:
    path = pathlib.Path(tmp) / 'image.png'
    rows = [bytes([10,20,30,0,40,50,60,128]), bytes([70,80,90,255,100,110,120,255])]
    for filter_type in range(5):
        path.write_bytes(png(rows, filter_type))
        report = alpha.inspect_png(path)
        assert report['transparent_fraction'] == 0.25 and report['opaque_fraction'] == 0.5
        assert report['visible_pixels'] == 3 and report['alpha_min'] == 0 and report['alpha_max'] == 255
    result = subprocess.run([sys.executable, sys.argv[1], str(path)], capture_output=True, text=True)
    assert result.returncode == 0 and json.loads(result.stdout)['ok']
    for pixels,color in [(bytes([1,2,3,255]),6), (bytes([1,2,3,0]),6), (bytes([1,2,3]),2)]:
        path.write_bytes(png([pixels], color=color))
        result = subprocess.run([sys.executable, sys.argv[1], str(path)], capture_output=True, text=True)
        assert result.returncode == 3 and not json.loads(result.stdout)['ok']
    bad = bytearray(png(rows)); bad[29] ^= 1; path.write_bytes(bad)
    result = subprocess.run([sys.executable, sys.argv[1], str(path)], capture_output=True, text=True)
    assert result.returncode == 2 and not json.loads(result.stdout)['ok']
`,
      path.join(kitDir, "check_alpha.py"),
    ]);
  });
});
