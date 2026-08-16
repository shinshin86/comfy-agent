import path from "node:path";

const REPOSITORY_BLOB_URL = "https://github.com/shinshin86/comfy-agent/blob/main";

export type RewriteReference = {
  source: string;
  packageRelative: string;
  reference: string;
};

export type RewriteLinksOptions = {
  sourcePath: string;
  packageRoot: string;
  outputPath?: string;
  referenceMap?: ReadonlyMap<string, string>;
  unmappedReferencesToGitHub?: boolean;
};

export type RewriteLinksResult = {
  content: string;
  references: RewriteReference[];
};

const splitTargetSuffix = (target: string) => {
  const suffixAt = target.search(/[?#]/);
  return suffixAt < 0
    ? { file: target, suffix: "" }
    : { file: target.slice(0, suffixAt), suffix: target.slice(suffixAt) };
};

const isIgnoredTarget = (target: string) =>
  target.startsWith("#") ||
  target.startsWith("//") ||
  path.isAbsolute(target) ||
  /^[a-zA-Z]:[\\/]/.test(target) ||
  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target);

const toPackageRelative = (target: string, options: RewriteLinksOptions) => {
  const { file, suffix } = splitTargetSuffix(target);
  if (!file || isIgnoredTarget(target)) return null;
  const absolute = path.resolve(path.dirname(options.sourcePath), file);
  const relative = path.relative(options.packageRoot, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return { relative: relative.split(path.sep).join(path.posix.sep), suffix };
};

const defaultReferenceName = (relative: string) => path.posix.basename(relative);

const rewriteTarget = (
  target: string,
  options: RewriteLinksOptions,
  references: RewriteReference[],
) => {
  const resolved = toPackageRelative(target, options);
  if (!resolved) return target;
  const isReference =
    resolved.relative.startsWith("docs/") || resolved.relative.startsWith("recipes/");
  if (!isReference) return `${REPOSITORY_BLOB_URL}/${resolved.relative}${resolved.suffix}`;

  if (
    options.unmappedReferencesToGitHub &&
    options.referenceMap &&
    !options.referenceMap.has(resolved.relative)
  ) {
    return `${REPOSITORY_BLOB_URL}/${resolved.relative}${resolved.suffix}`;
  }

  const reference =
    options.referenceMap?.get(resolved.relative) ?? defaultReferenceName(resolved.relative);
  references.push({
    source: path.resolve(options.packageRoot, resolved.relative),
    packageRelative: resolved.relative,
    reference,
  });
  const outputPath = options.outputPath ?? "SKILL.md";
  const fromDir = path.posix.dirname(outputPath);
  const destination = path.posix.join("references", reference);
  const rewritten = path.posix.relative(fromDir, destination) || path.posix.basename(destination);
  return `${rewritten}${resolved.suffix}`;
};

const rewriteMarkdownLinks = (
  markdown: string,
  options: RewriteLinksOptions,
  references: RewriteReference[],
) =>
  markdown.replace(/(\]\()([^\s)]+)([^)]*\))/g, (_match, open, target, close) => {
    return `${open}${rewriteTarget(target, options, references)}${close}`;
  });

const rewriteAngleLinks = (
  markdown: string,
  options: RewriteLinksOptions,
  references: RewriteReference[],
) =>
  markdown.replace(/<([^<>\s]+)>/g, (match, target: string) => {
    if (!target.includes("/") && !target.startsWith(".") && !target.endsWith(".md")) return match;
    return `<${rewriteTarget(target, options, references)}>`;
  });

export const rewriteLinks = (
  markdown: string,
  options: RewriteLinksOptions,
): RewriteLinksResult => {
  const references: RewriteReference[] = [];
  const content = rewriteAngleLinks(
    rewriteMarkdownLinks(markdown, options, references),
    options,
    references,
  );
  const unique = new Map(references.map((reference) => [reference.packageRelative, reference]));
  return { content, references: [...unique.values()] };
};

export const collectLinkedResources = (markdown: string, options: RewriteLinksOptions) =>
  rewriteLinks(markdown, options).references;
