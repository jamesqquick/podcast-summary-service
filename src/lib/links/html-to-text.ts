/**
 * Dependency-free HTML → readable text.
 *
 * This is intentionally a pragmatic heuristic, not a full readability engine:
 * it strips non-content elements, prefers the main article region when present,
 * converts block-level structure to line breaks, and decodes common entities.
 * Pure and synchronous so it is trivially unit-testable.
 */

export interface ReadablePage {
  title: string;
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const codePoint =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

function removeRegion(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return html.replace(re, " ");
}

/** Pull a `<meta>` content value by name or property attribute. */
function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const match = re.exec(html);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return undefined;
}

export function extractTitle(html: string): string {
  const ogTitle = metaContent(html, "og:title") ?? metaContent(html, "twitter:title");
  if (ogTitle) return ogTitle;
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match?.[1]) return decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return "";
}

/** Isolate the most content-rich region: <article>, then <main>, else <body>. */
function selectContentRegion(html: string): string {
  for (const tag of ["article", "main"]) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const matches = [...html.matchAll(new RegExp(re, "gi"))];
    if (matches.length > 0) {
      // Choose the longest matching region (most likely the body content).
      return matches.reduce((a, b) => (b[1]!.length > a.length ? b[1]! : a), "");
    }
  }
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return body?.[1] ?? html;
}

const BLOCK_BOUNDARY =
  /<\/?(?:p|div|section|article|header|footer|li|ul|ol|h[1-6]|br|tr|blockquote|pre|figure|figcaption)\b[^>]*>/gi;

export function htmlToText(html: string): string {
  let working = html;
  for (const tag of ["script", "style", "noscript", "template", "svg", "head"]) {
    working = removeRegion(working, tag);
  }
  working = working.replace(/<!--[\s\S]*?-->/g, " ");
  working = selectContentRegion(working);
  working = working.replace(BLOCK_BOUNDARY, "\n");
  working = working.replace(/<[^>]+>/g, " ");
  working = decodeEntities(working);
  return working
    .split("\n")
    .map((line) => line.replace(/[ \t\f\r]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractReadable(html: string): ReadablePage {
  return { title: extractTitle(html), text: htmlToText(html) };
}

/** Bound text to a character budget on a paragraph boundary where possible. */
export function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastBreak = slice.lastIndexOf("\n");
  return (lastBreak > maxChars * 0.6 ? slice.slice(0, lastBreak) : slice).trim();
}
