import path from "node:path";
import { describe, expect, it } from "vitest";
import { rewriteLinks } from "../src/skills/rewrite.js";

const root = path.resolve("/package");
const sourcePath = path.join(root, ".claude", "skills", "demo", "SKILL.md");

describe("skill link rewriting", () => {
  it("copies docs links into references", () => {
    const result = rewriteLinks("[policy](../../../docs/policy.md)", {
      sourcePath,
      packageRoot: root,
    });
    expect(result.content).toBe("[policy](references/policy.md)");
    expect(result.references).toEqual([
      expect.objectContaining({ packageRelative: "docs/policy.md", reference: "policy.md" }),
    ]);
  });

  it("rewrites non-reference repository links to GitHub", () => {
    const result = rewriteLinks("[setup](../../../scripts/colab/z_image/01_setup.py)", {
      sourcePath,
      packageRoot: root,
    });
    expect(result.content).toBe(
      "[setup](https://github.com/shinshin86/comfy-agent/blob/main/scripts/colab/z_image/01_setup.py)",
    );
  });

  it("leaves web, anchor, and absolute links unchanged", () => {
    const markdown = "[web](https://example.com) [anchor](#part) [absolute](/tmp/file.md)";
    expect(rewriteLinks(markdown, { sourcePath, packageRoot: root }).content).toBe(markdown);
  });

  it("uses sibling links inside references and sends links beyond the crawl map to GitHub", () => {
    const policy = path.join(root, "docs", "policy.md");
    const references = new Map([["recipes/demo/guide.md", "guide.md"]]);
    const mapped = rewriteLinks("[guide](../recipes/demo/guide.md)", {
      sourcePath: policy,
      packageRoot: root,
      outputPath: "references/policy.md",
      referenceMap: references,
      unmappedReferencesToGitHub: true,
    });
    expect(mapped.content).toBe("[guide](guide.md)");
    const unmapped = rewriteLinks("[other](other.md)", {
      sourcePath: policy,
      packageRoot: root,
      outputPath: "references/policy.md",
      referenceMap: references,
      unmappedReferencesToGitHub: true,
    });
    expect(unmapped.content).toContain("https://github.com/shinshin86/comfy-agent/blob/main/docs/other.md");
  });
});
