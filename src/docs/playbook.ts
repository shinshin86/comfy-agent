export type PlaybookSection = {
  index: number;
  title: string;
  slug: string;
  content: string;
};

const sectionSlug = (title: string) => {
  const shortTitle = title
    .split(/\s+[—–]\s+/, 1)[0]
    .replace(/\s*\([^)]*\)\s*$/, "")
    .normalize("NFKD")
    .toLowerCase();
  return shortTitle
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const parsePlaybookSections = (markdown: string): PlaybookSection[] => {
  const headings = [...markdown.matchAll(/^##\s+(?:(\d+)\.\s+)?(.+)$/gm)];
  return headings.map((match, position) => {
    const start = match.index ?? 0;
    const end = headings[position + 1]?.index ?? markdown.length;
    const title = match[2].trim();
    return {
      index: match[1] ? Number(match[1]) : position + 1,
      title,
      slug: sectionSlug(title),
      content: `${markdown.slice(start, end).trimEnd()}\n`,
    };
  });
};

export const findPlaybookSection = (
  sections: PlaybookSection[],
  requested: string,
): PlaybookSection | null => {
  const normalized = requested.trim().toLowerCase();
  return (
    sections.find(
      (section) => String(section.index) === normalized || section.slug === normalized,
    ) ?? null
  );
};
