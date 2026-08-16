import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSkillInstall, runSkillList } from "../src/cli/skill.js";
import { installSkills } from "../src/skills/install.js";
import { resolveSkillTarget } from "../src/skills/targets.js";
import { createTmpWorkdir, type TmpWorkdir } from "./helpers/tmp-workdir.js";

const originalResourceRoot = process.env.COMFY_AGENT_RESOURCE_ROOT;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalResourceRoot === undefined) delete process.env.COMFY_AGENT_RESOURCE_ROOT;
  else process.env.COMFY_AGENT_RESOURCE_ROOT = originalResourceRoot;
});

const createResourcePackage = async (tmp: TmpWorkdir) => {
  const root = path.join(tmp.root, "resources");
  await Promise.all([
    fs.mkdir(path.join(root, ".claude", "skills", "demo"), { recursive: true }),
    fs.mkdir(path.join(root, "docs"), { recursive: true }),
    fs.mkdir(path.join(root, "recipes", "demo"), { recursive: true }),
    fs.mkdir(path.join(root, "scripts", "colab"), { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(root, "package.json"), '{"name":"comfy-agent"}\n'),
    fs.writeFile(
      path.join(root, ".claude", "skills", "demo", "SKILL.md"),
      [
        "---",
        "name: demo",
        "description: Demo skill",
        "extra: removed",
        "---",
        "",
        "# Demo",
        "",
        "[Policy](../../../docs/policy.md)",
        "[Setup](../../../scripts/colab/setup.py)",
        "",
      ].join("\n"),
    ),
    fs.writeFile(path.join(root, "docs", "policy.md"), "[Guide](../recipes/demo/guide.md)\n"),
    fs.writeFile(path.join(root, "recipes", "demo", "guide.md"), "# Guide\n"),
    fs.writeFile(path.join(root, "scripts", "colab", "setup.py"), "# setup\n"),
  ]);
  process.env.COMFY_AGENT_RESOURCE_ROOT = root;
  return root;
};

describe("skill targets", () => {
  it.each([
    ["claude", ".claude/skills", ".claude/skills"],
    ["codex", ".agents/skills", ".agents/skills"],
    ["cursor", ".cursor/skills", ".cursor/skills"],
    ["gemini", ".gemini/skills", ".gemini/skills"],
    ["openclaw", ".agents/skills", ".openclaw/skills"],
  ])("resolves %s project and global directories", (agent, projectDir, globalDir) => {
    const cwd = path.resolve("project");
    const home = path.resolve("home");
    expect(resolveSkillTarget(agent, { cwd, home }).targetDir).toBe(path.join(cwd, projectDir));
    expect(resolveSkillTarget(agent, { cwd, home, global: true }).targetDir).toBe(
      path.join(home, globalDir),
    );
  });

  it("supports a custom directory and rejects scope conflicts", () => {
    const cwd = path.resolve("project");
    expect(resolveSkillTarget("codex", { cwd, dir: "custom" })).toMatchObject({
      scope: "custom",
      targetDir: path.join(cwd, "custom"),
    });
    expect(() => resolveSkillTarget("codex", { global: true, project: true })).toThrowError(
      expect.objectContaining({ code: "SKILL_SCOPE_CONFLICT", exitCode: 2 }),
    );
  });

  it("rejects unsupported agents", () => {
    expect(() => resolveSkillTarget("other")).toThrowError(
      expect.objectContaining({
        code: "SKILL_AGENT_UNSUPPORTED",
        details: { agent: "other", supported: expect.any(Array) },
      }),
    );
  });
});

describe("skill installation", () => {
  it("lists bundled skills in the JSON envelope", async () => {
    const tmp = await createTmpWorkdir();
    await createResourcePackage(tmp);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const payload = await runSkillList({ json: true });
    expect(payload).toEqual({
      ok: true,
      skills: [{ name: "demo", description: "Demo skill", path: expect.any(String) }],
    });
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual(payload);
  });

  it("creates references and a marker, then updates idempotently", async () => {
    const tmp = await createTmpWorkdir();
    const root = await createResourcePackage(tmp);
    const options = {
      agent: "codex",
      cwd: tmp.cwd,
      home: tmp.home,
      now: () => new Date("2026-08-16T00:00:00.000Z"),
    };
    const created = await installSkills(["demo"], options);
    expect(created).toMatchObject({
      ok: true,
      agent: "codex",
      scope: "project",
      installed: [{ name: "demo", status: "created", files: expect.any(Array) }],
    });
    const target = path.join(tmp.cwd, ".agents", "skills", "demo");
    const installedSkill = await fs.readFile(path.join(target, "SKILL.md"), "utf-8");
    expect(installedSkill).toContain("Installed by `comfy-agent skill install`");
    expect(installedSkill).toContain("references/policy.md");
    expect(installedSkill).not.toContain("extra: removed");
    expect(installedSkill).not.toMatch(/\]\(\.\.\//);
    expect(await fs.readFile(path.join(target, "references", "policy.md"), "utf-8"))
      .toContain("[Guide](guide.md)");
    await expect(fs.stat(path.join(target, "references", "guide.md"))).resolves.toBeDefined();
    for (const relative of ["SKILL.md", "references/policy.md", "references/guide.md"]) {
      const file = path.join(target, relative);
      const markdown = await fs.readFile(file, "utf-8");
      for (const match of markdown.matchAll(/\]\(([^\s)]+)/g)) {
        const link = match[1];
        if (/^(?:https?:|#|\/)/.test(link)) continue;
        expect(link).not.toMatch(/^\.\.\//);
        await expect(fs.stat(path.resolve(path.dirname(file), link))).resolves.toBeDefined();
      }
    }
    const marker = JSON.parse(await fs.readFile(path.join(target, ".comfy-agent-skill.json"), "utf-8"));
    expect(marker).toMatchObject({
      source: ".claude/skills/demo",
      installed_at: "2026-08-16T00:00:00.000Z",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    expect((await installSkills(["demo"], options)).installed[0].status).toBe("unchanged");
    await fs.appendFile(path.join(root, ".claude", "skills", "demo", "SKILL.md"), "\nUpdated.\n");
    expect((await installSkills(["demo"], options)).installed[0].status).toBe("updated");

    await fs.rm(path.join(target, ".comfy-agent-skill.json"));
    await fs.appendFile(path.join(target, "SKILL.md"), "\nUser edit.\n");
    await expect(installSkills(["demo"], options)).rejects.toMatchObject({
      code: "FILE_EXISTS",
      exitCode: 2,
      details: { path: target, kind: "skill", hint: "--force" },
    });
    expect((await installSkills(["demo"], { ...options, force: true })).installed[0].status).toBe(
      "overwritten",
    );
  });

  it("does not write during a dry run and emits the JSON shape", async () => {
    const tmp = await createTmpWorkdir();
    await createResourcePackage(tmp);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const payload = await runSkillInstall(["demo"], {
      agent: "claude",
      cwd: tmp.cwd,
      home: tmp.home,
      dir: "planned-skills",
      dryRun: true,
      json: true,
    });
    expect(payload).toMatchObject({
      ok: true,
      agent: "claude",
      scope: "custom",
      target_dir: path.join(tmp.cwd, "planned-skills"),
      installed: [{ name: "demo", status: "would_create" }],
      package_version: expect.any(String),
    });
    await expect(fs.stat(path.join(tmp.cwd, "planned-skills"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ ok: true });
  });

  it("rejects unknown skills", async () => {
    const tmp = await createTmpWorkdir();
    await createResourcePackage(tmp);
    await expect(
      installSkills(["missing"], { agent: "codex", cwd: tmp.cwd, home: tmp.home }),
    ).rejects.toMatchObject({
      code: "SKILL_NOT_FOUND",
      exitCode: 2,
      details: { name: "missing", available: ["demo"] },
    });
  });

  it("wraps local filesystem failures as SKILL_INSTALL_FAILED with exit 2", async () => {
    const tmp = await createTmpWorkdir();
    await createResourcePackage(tmp);
    const blocked = path.join(tmp.cwd, "blocked");
    await fs.writeFile(blocked, "not a directory", "utf-8");
    await expect(
      installSkills(["demo"], {
        agent: "codex",
        cwd: tmp.cwd,
        home: tmp.home,
        dir: path.join(blocked, "skills"),
      }),
    ).rejects.toMatchObject({
      code: "SKILL_INSTALL_FAILED",
      exitCode: 2,
      details: { path: expect.any(String), cause: expect.any(String) },
    });
  });
});
