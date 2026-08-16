import path from "node:path";
import { CliError } from "../io/errors.js";
import { RESOURCES, readResource, resourcePath } from "../io/resources.js";
import { print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { findPlaybookSection, parsePlaybookSections } from "../docs/playbook.js";
import { getPackageVersion } from "../utils/version.js";

const PLAYBOOKS = {
  "agent-playbook": RESOURCES.playbook,
  "minimax-h3-prompting": path.posix.join(RESOURCES.docsDir, "minimax-h3-prompting.md"),
} as const;

export type PlaybookName = keyof typeof PLAYBOOKS;

export type PlaybookOptions = {
  section?: string;
  list?: boolean;
  path?: boolean;
  json?: boolean;
};

const availablePlaybooks = () => Object.keys(PLAYBOOKS).sort() as PlaybookName[];

const resolvePlaybook = (name: string): { name: PlaybookName; relPath: string } => {
  if (name in PLAYBOOKS) {
    const resolvedName = name as PlaybookName;
    return { name: resolvedName, relPath: PLAYBOOKS[resolvedName] };
  }
  throw new CliError("PLAYBOOK_NOT_FOUND", t("playbook.not_found", { name }), 2, {
    name,
    available: availablePlaybooks(),
  });
};

export const runPlaybook = async (
  requestedName: string | undefined,
  options: PlaybookOptions,
) => {
  const { name, relPath } = resolvePlaybook(requestedName ?? "agent-playbook");
  const content = await readResource(relPath);
  const resolvedPath = resourcePath(relPath);
  const sections = parsePlaybookSections(content);
  const selected = options.section ? findPlaybookSection(sections, options.section) : null;
  if (options.section && !selected) {
    throw new CliError(
      "PLAYBOOK_SECTION_NOT_FOUND",
      t("playbook.section_not_found", { section: options.section }),
      2,
      {
        section: options.section,
        available: sections.map(({ index, title, slug }) => ({ index, title, slug })),
      },
    );
  }

  const payload = {
    ok: true,
    name,
    path: resolvedPath,
    package_version: getPackageVersion(),
    sections: sections.map(({ index, title, slug }) => ({ index, title, slug })),
    section: selected
      ? { index: selected.index, title: selected.title, slug: selected.slug }
      : null,
    content: selected?.content ?? (options.list || options.path ? "" : content),
  };

  if (options.json) printJson(payload);
  else if (options.path) print(resolvedPath);
  else if (options.list) {
    for (const section of sections) print(`${section.index}\t${section.slug}\t${section.title}`);
  } else print(payload.content);
  return payload;
};
