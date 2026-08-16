import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPlaybook } from "../src/cli/playbook.js";
import { findPlaybookSection, parsePlaybookSections } from "../src/docs/playbook.js";
import { RESOURCES, readResource } from "../src/io/resources.js";

afterEach(() => vi.restoreAllMocks());

describe("playbook sections", () => {
  it("parses the seven numbered agent playbook sections", async () => {
    const sections = parsePlaybookSections(await readResource(RESOURCES.playbook));
    expect(sections).toHaveLength(7);
    expect(sections[0]).toMatchObject({ index: 1, slug: "blueprint-protocol" });
    expect(findPlaybookSection(sections, "3")?.slug).toBe("error-contract");
    expect(findPlaybookSection(sections, "error-contract")?.index).toBe(3);
  });

  it("returns JSON content and selected section metadata", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const payload = await runPlaybook("agent-playbook", { section: "error-contract", json: true });
    expect(payload).toMatchObject({
      ok: true,
      name: "agent-playbook",
      package_version: expect.any(String),
      section: { index: 3, slug: "error-contract" },
      sections: expect.any(Array),
    });
    expect(payload.content).toMatch(/^## 3\. Error contract/);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ ok: true });
  });

  it("lists sections and prints the resolved path", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runPlaybook(undefined, { list: true });
    expect(stdout.mock.calls.map(([value]) => String(value)).join(""))
      .toContain("1\tblueprint-protocol");
    stdout.mockClear();
    const payload = await runPlaybook("minimax-h3-prompting", { path: true });
    await expect(fs.stat(payload.path)).resolves.toBeDefined();
    expect(String(stdout.mock.calls[0]?.[0]).trim()).toBe(payload.path);
  });

  it("rejects unknown playbooks and sections with available values", async () => {
    await expect(runPlaybook("missing", {})).rejects.toMatchObject({
      code: "PLAYBOOK_NOT_FOUND",
      exitCode: 2,
      details: { name: "missing", available: expect.any(Array) },
    });
    await expect(runPlaybook("agent-playbook", { section: "missing" })).rejects.toMatchObject({
      code: "PLAYBOOK_SECTION_NOT_FOUND",
      exitCode: 2,
      details: { section: "missing", available: expect.any(Array) },
    });
  });
});
