// The docs engine: pages are written in a small Markdown subset (content/docs/*.ts) and parsed here into
// blocks, a table of contents and a search index. Supported: ## and ### headings, paragraphs, "- " and
// "1. " lists, ``` fences, "| a | b |" tables, "> [!NOTE|TIP|WARNING] Title" callouts, and inline
// **bold**, `code` and [text](href).
import { DOC_SECTIONS } from "@/content/docs";

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  body: string;
}

export type Block =
  | { type: "h2" | "h3"; id: string; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; lang: string; code: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "callout"; kind: "note" | "tip" | "warning"; title: string; blocks: Block[] };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parse(src: string): Block[] {
  const lines = src.replace(/^\n+|\s+$/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(##|###) (.+)$/.exec(line);
    if (heading) {
      const text = heading[2].trim();
      blocks.push({ type: heading[1] === "##" ? "h2" : "h3", id: slugify(text), text });
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ type: "code", lang, code: code.join("\n") });
      continue;
    }
    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) inner.push(lines[i++].replace(/^> ?/, ""));
      const head = /^\[!(NOTE|TIP|WARNING)\]\s*(.*)$/.exec(inner[0] ?? "");
      blocks.push({
        type: "callout",
        kind: (head?.[1].toLowerCase() ?? "note") as "note" | "tip" | "warning",
        title: head?.[2] ?? "",
        blocks: parse((head ? inner.slice(1) : inner).join("\n")),
      });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      blocks.push({
        type: "table",
        head: cells(rows[0]),
        rows: rows.slice(2).map(cells),
      });
      continue;
    }
    const list = /^(- |\d+\. )/.exec(line);
    if (list) {
      const ordered = list[1] !== "- ";
      const pattern = ordered ? /^\d+\. / : /^- /;
      const items: string[] = [];
      while (i < lines.length && (pattern.test(lines[i]) || /^ {2,}\S/.test(lines[i]))) {
        if (pattern.test(lines[i])) items.push(lines[i].replace(pattern, ""));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(##|```|>|\||- |\d+\. )/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push({ type: "p", text: para.join(" ") });
  }
  return blocks;
}

/** Inline Markdown to plain text, for search and descriptions. */
export function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export const DOC_PAGES: (DocPage & { section: string })[] = DOC_SECTIONS.flatMap((s) =>
  s.pages.map((p) => ({ ...p, section: s.title })),
);

export function docHref(slug: string): string {
  return slug === "overview" ? "/docs" : `/docs/${slug}`;
}

export function getDoc(slug: string) {
  const index = DOC_PAGES.findIndex((p) => p.slug === slug);
  if (index < 0) return null;
  const page = DOC_PAGES[index];
  const blocks = parse(page.body);
  const toc = blocks.filter((b): b is Extract<Block, { type: "h2" | "h3" }> => b.type === "h2" || b.type === "h3");
  return { page, blocks, toc, prev: DOC_PAGES[index - 1] ?? null, next: DOC_PAGES[index + 1] ?? null };
}

export interface SearchEntry {
  href: string;
  page: string;
  section: string;
  heading: string;
  text: string;
}

/** One entry per page intro and per ## section: what the docs search palette ranks. */
export function searchIndex(): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const page of DOC_PAGES) {
    let current: SearchEntry = { href: docHref(page.slug), page: page.title, section: page.section, heading: "", text: page.description };
    out.push(current);
    for (const block of parse(page.body)) {
      if (block.type === "h2") {
        current = { href: `${docHref(page.slug)}#${block.id}`, page: page.title, section: page.section, heading: block.text, text: "" };
        out.push(current);
        continue;
      }
      const text = blockText(block);
      if (text) current.text = `${current.text} ${text}`.trim();
    }
  }
  return out;
}

function blockText(block: Block): string {
  switch (block.type) {
    case "h3":
    case "p":
      return plain(block.text);
    case "ul":
    case "ol":
      return block.items.map(plain).join(" ");
    case "table":
      return [...block.head, ...block.rows.flat()].map(plain).join(" ");
    case "callout":
      return [block.title, ...block.blocks.map(blockText)].join(" ");
    case "code":
      return block.code;
    default:
      return "";
  }
}
