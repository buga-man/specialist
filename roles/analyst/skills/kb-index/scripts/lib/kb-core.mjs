/**
 * kb-core.mjs — shared logic of the kb-index skill.
 *
 * Pure functions over strings and arrays: no file system, no git, no process
 * access. The file/git layer lives in kb-fs.mjs; the CLI
 * (skills/kb-index/scripts/kb.mjs) and the Claude Code Stop hook
 * (kb-gate.mjs) call both.
 *
 * Contract highlights:
 *   - parseFrontmatter(text) -> { data, body, bodyStartLine }
 *       data — top-level keys; a value is a string, a string[] or a nested map.
 *       body — the text after the closing "---" line and after its newline.
 *       bodyStartLine — 1-based line in the original text where body starts.
 *   - A line inside the body is bodyStartLine + (bodyLine - 1) in the file.
 *     For a document without frontmatter bodyStartLine is 1 and the body is
 *     the whole text, so the same formula holds.
 *
 * Fail-safe: a malformed frontmatter yields an empty data map and the whole
 * text as body — a document is never lost, only its metadata.
 */
import { createHash } from "node:crypto";
import { posix } from "node:path";

/** Strips a trailing CR so CRLF files compare equal to LF files. */
function stripCr(line) {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/** Removes one pair of surrounding quotes. */
function unquote(value) {
  const v = value.trim();
  const first = v[0];
  const last = v[v.length - 1];
  if (v.length >= 2 && (first === '"' || first === "'") && first === last) return v.slice(1, -1);
  return v;
}

/** Number of leading spaces of a line. */
function indentOf(line) {
  return line.length - line.trimStart().length;
}

/**
 * Collects the lines that belong to a key without a value: either a list
 * ("- item") or a nested map ("key: value"). Returns kind "none" when the
 * key has no children.
 */
function collectChildren(lines, start, indent) {
  let j = start;
  while (j < lines.length && stripCr(lines[j]).trim() === "") j++;
  if (j >= lines.length) return { kind: "none", next: start };

  const first = stripCr(lines[j]);
  if (indentOf(first) <= indent) return { kind: "none", next: start };

  const trimmed = first.trim();
  if (trimmed === "-" || trimmed.startsWith("- ")) {
    const items = [];
    let k = j;
    while (k < lines.length) {
      const line = stripCr(lines[k]);
      if (line.trim() === "") {
        k++;
        continue;
      }
      if (indentOf(line) <= indent) break;
      const t = line.trim();
      if (t !== "-" && !t.startsWith("- ")) break;
      items.push(unquote(t.replace(/^-\s*/, "")));
      k++;
    }
    return { kind: "list", items, next: k };
  }

  const nested = parseMap(lines, j, indentOf(first));
  return { kind: "map", map: nested.map, next: nested.next };
}

/**
 * Parses a block of YAML-ish lines into a map. Keys at the given indent are
 * read; deeper lines belong to the key that precedes them.
 */
function parseMap(lines, start, indent) {
  const map = {};
  let i = start;

  while (i < lines.length) {
    const line = stripCr(lines[i]);
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const currentIndent = indentOf(line);
    if (currentIndent < indent) break;
    if (currentIndent > indent) {
      i++;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      i++;
      continue;
    }
    const match = /^([^:]+):(.*)$/.exec(trimmed);
    if (!match) {
      i++;
      continue;
    }
    const key = match[1].trim();
    const rest = match[2].trim();
    i++;

    if (/^[>|][-+]?$/.test(rest)) {
      const literal = rest[0] === "|";
      const strip = rest.endsWith("-");
      const parts = [];
      while (i < lines.length) {
        const child = stripCr(lines[i]);
        if (child.trim() === "") {
          parts.push("");
          i++;
          continue;
        }
        if (indentOf(child) <= indent) break;
        parts.push(child.trim());
        i++;
      }
      let text = literal ? parts.join("\n") : parts.join(" ");
      if (strip) text = text.replace(/\n+$/, "");
      map[key] = text;
      continue;
    }

    if (rest === "") {
      const children = collectChildren(lines, i, indent);
      i = children.next;
      if (children.kind === "list") map[key] = children.items;
      else if (children.kind === "map") map[key] = children.map;
      else map[key] = "";
      continue;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      map[key] = rest
        .slice(1, -1)
        .split(",")
        .map((item) => unquote(item))
        .filter((item) => item !== "");
      continue;
    }

    map[key] = unquote(rest);
  }

  return { map, next: i };
}

/**
 * Splits a document into its frontmatter and its body.
 *
 * @param {string} text — the whole document.
 * @returns {{ data: Record<string, unknown>, body: string, bodyStartLine: number }}
 */
export function parseFrontmatter(text) {
  const whole = { data: {}, body: typeof text === "string" ? text : "", bodyStartLine: 1 };
  if (typeof text !== "string") return whole;

  const lines = text.split("\n");
  if (stripCr(lines[0]) !== "---") return whole;

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (stripCr(lines[i]) === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) return whole;

  const block = lines.slice(1, close);
  // A document that starts with "---" but holds no fields is not frontmatter:
  // the thematic break belongs to the body.
  const hasField = block.some((line) => {
    const text = stripCr(line);
    return text.trim() === text && /^[^:\s][^:]*:/.test(text);
  });
  if (!hasField) return whole;

  const data = parseMap(block, 0, 0).map;
  return {
    data,
    body: lines.slice(close + 1).join("\n"),
    bodyStartLine: close + 2,
  };
}

/** A list item: "- item", "* item", "1. item". */
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** A horizontal rule: three or more of "-", "*" or "_". */
const RULE = /^[-*_](?:\s*[-*_]){2,}$/;

/**
 * Marks every line that belongs to a fenced code block, fence markers
 * included. A "# comment" inside a shell snippet is not a heading, and a
 * code line is not prose.
 */
function fencedLines(lines) {
  const inside = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = /^(`{3,}|~{3,})/.exec(lines[i].trim());
    if (fence === null) {
      if (marker) {
        fence = marker[1][0];
        inside[i] = true;
      }
      continue;
    }
    inside[i] = true;
    if (marker && marker[1][0] === fence) fence = null;
  }
  return inside;
}

/** A paragraph is prose when it is not a heading, quote, table, rule or a
 *  list of three or more items (a table of contents). */
function isProseParagraph(lines) {
  const first = lines[0].trim();
  if (!first) return false;
  if (/^[#>|]/.test(first)) return false;
  if (first.startsWith("```") || first.startsWith("~~~")) return false;
  if (RULE.test(first)) return false;
  const items = lines.filter((line) => LIST_ITEM.test(line));
  if (items.length >= 3 && items.length === lines.length) return false;
  return true;
}

/**
 * The essence of a document: its frontmatter description, else its summary,
 * else the first prose paragraph of the body.
 *
 * @param {string} body — the body of the document.
 * @param {Record<string, unknown>} data — its frontmatter.
 * @returns {string} the gist, or "" when the document has none.
 */
export function extractGist(body, data) {
  const meta = data && typeof data === "object" ? data : {};
  for (const key of ["description", "summary"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }

  const lines = String(body ?? "").split("\n");
  const inside = fencedLines(lines);
  let gist = "";
  let paragraph = [];

  const take = () => {
    if (!gist && paragraph.length && isProseParagraph(paragraph)) {
      gist = paragraph
        .map((line) => line.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    if (inside[i]) {
      take();
      continue;
    }
    const trimmed = lines[i].trim();
    if (trimmed === "" || /^#{1,6}\s/.test(trimmed)) {
      take();
      continue;
    }
    paragraph.push(lines[i]);
  }
  take();

  return gist;
}

/**
 * The anchor of a document: the "##" or "###" section with the most own text.
 * The own text of a heading is what sits between it and the next heading of
 * any level. Returns null when the document has no "##" or "###" section.
 *
 * @param {string} body — the body of the document.
 * @returns {{ heading: string, line: number, chars: number } | null}
 */
export function extractAnchor(body) {
  const lines = String(body ?? "").split("\n");
  const inside = fencedLines(lines);
  const headings = [];

  for (let i = 0; i < lines.length; i++) {
    if (inside[i]) continue;
    const match = /^(#{1,6})\s+(.*)$/.exec(stripCr(lines[i]));
    if (match) headings.push({ level: match[1].length, text: match[2].trim(), line: i + 1 });
  }

  let best = null;
  for (let h = 0; h < headings.length; h++) {
    const current = headings[h];
    if (current.level !== 2 && current.level !== 3) continue;
    const next = headings[h + 1];
    const end = next ? next.line - 1 : lines.length;
    let chars = 0;
    for (let i = current.line; i < end; i++) chars += lines[i].length;
    if (!best || chars > best.chars) best = { heading: current.text, line: current.line, chars };
  }

  return best;
}

/** sha1 of a text, hex — the fingerprint of a document. */
export function computeHash(content) {
  return createHash("sha1").update(String(content ?? ""), "utf8").digest("hex");
}

/** The directory of a posix path; "" for a file in the project root. */
function dirOf(p) {
  const dir = posix.dirname(p);
  return dir === "." ? "" : dir;
}

/** The slug of a path: its file name without the extension. */
function slugOf(p) {
  return posix.basename(p, posix.extname(p));
}

/**
 * The markdown links of a document that point at other known documents.
 *
 * A link is taken as "[text](path.md)"; the fragment is dropped, an external
 * URL is ignored, and the path is resolved against the directory of the
 * document. A link whose target is not a known path is dropped.
 *
 * @param {string} body — the body of the document.
 * @param {string} fromPath — the path of the document, relative to the root.
 * @param {Set<string>} knownPaths — every path of the corpus.
 * @returns {string[]} sorted paths, without duplicates.
 */
/** Collect the markdown-style link targets of a body: the ones resolving inside the
 *  corpus and the ones pointing outside it (dead cross-references). */
function linkTargets(body, fromPath, knownPaths) {
  const dir = dirOf(fromPath);
  const resolved = new Set();
  const broken = new Set();
  const text = String(body ?? "");
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;

  let match = pattern.exec(text);
  while (match !== null) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1).trim();
    target = target.split("#")[0].trim();
    if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      const path = posix.join(dir, target.startsWith("/") ? target.slice(1) : target);
      if (knownPaths && knownPaths.has(path)) resolved.add(path);
      else broken.add(path);
    }
    match = pattern.exec(text);
  }

  return { resolved: [...resolved].sort(), broken: [...broken].sort() };
}

export function extractLinks(body, fromPath, knownPaths) {
  return linkTargets(body, fromPath, knownPaths).resolved;
}

/** The link targets of a body that resolve to no known document — dead cross-references,
 *  the corpus-health signal the build and audit reports surface. */
export function brokenLinks(body, fromPath, knownPaths) {
  return linkTargets(body, fromPath, knownPaths).broken;
}

/** The frontmatter fields that hold relations between documents. */
export const RELATION_FIELDS = ["parent", "depends_on", "children", "br", "us"];

/**
 * Builds the index record of a document.
 *
 * The relation fields are kept as they are: the resolver reads them from the
 * record, and other hooks may want them as well.
 *
 * An excluded document keeps its metadata but gives up its body: no gist, no
 * anchor, no links — nothing of the text is copied into the index.
 *
 * @param {{ path: string, content: string, knownPaths: Set<string>, mtime: number, excluded?: boolean }} input
 * @returns {Record<string, unknown>} the record.
 */
export function buildRecord({ path, content, knownPaths, mtime, excluded }) {
  const { data, body, bodyStartLine } = parseFrontmatter(content);
  const str = (value) => (typeof value === "string" ? value : "");
  const anchor = excluded ? null : extractAnchor(body);

  const record = {
    path,
    id: str(data.id),
    title: str(data.title),
    status: str(data.status),
    owner: str(data.owner),
    service: str(data.service),
    docType: str(data["doc-type"]) || str(data.type),
    created: str(data.created),
    lastUpdated: str(data["last-updated"]),
    gist: excluded ? "" : extractGist(body, data),
    anchor: anchor
      ? { heading: anchor.heading, line: bodyStartLine + anchor.line - 1, chars: anchor.chars }
      : null,
    links: excluded ? [] : extractLinks(body, path, knownPaths),
    refs: [],
    hash: computeHash(content),
    bytes: Buffer.byteLength(String(content ?? ""), "utf8"),
    mtime,
  };

  for (const field of RELATION_FIELDS) {
    if (data[field] !== undefined) record[field] = data[field];
  }

  return record;
}

/**
 * Turns a glob into a regular expression. "**" crosses directories, "*" and
 * "?" do not.
 */
function globToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
        if (pattern[i + 1] === "/") i++;
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      out += "[^/]";
      continue;
    }
    out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/**
 * Whether a path matches a glob. A pattern without a slash matches at any
 * level, like in .gitignore.
 */
export function matchesPattern(pattern, path) {
  const text = String(pattern);
  const anchored = text.includes("/") ? text : `**/${text}`;
  return globToRegExp(anchored).test(path);
}

/**
 * The paths the index covers: the roots and the include patterns of the
 * configuration, when they are set.
 *
 * @param {string[]} paths — every path of the corpus.
 * @param {{ roots?: string[], include?: string[] }} config
 * @returns {string[]}
 */
export function selectPaths(paths, config) {
  const roots = config.roots || [];
  const include = config.include || [];
  return paths.filter((path) => {
    if (roots.length && !roots.some((root) => path === root || path.startsWith(`${root}/`))) return false;
    if (include.length && !include.some((pattern) => matchesPattern(pattern, path))) return false;
    return true;
  });
}

/**
 * Whether the body of a path must stay out of the index.
 *
 * @param {string} path
 * @param {{ exclude?: string[] }} config
 * @returns {boolean}
 */
export function isExcluded(path, config) {
  const exclude = config.exclude || [];
  return exclude.some((pattern) => matchesPattern(pattern, path));
}

/**
 * Resolves the relation fields of the records against the corpus.
 *
 * A token of a relation field is a link only when it matches an existing id
 * or slug. It resolves to a path in the same directory when there is exactly
 * one, otherwise to the single match in the corpus; several matches stay
 * ambiguous — they are never guessed. A token that matches nothing is free
 * text and is not a link at all.
 *
 * @param {Record<string, unknown>[]} records — every record of the corpus.
 * @param {string[]} keys — the relation fields to read.
 * @returns {{ resolved: number, ambiguous: number, freeText: number,
 *   refs: Record<string, Array<{ key: string, value: string, resolved: string | null, candidates: string[] }>> }}
 */
export function resolveRefs(records, keys) {
  const byId = new Map();
  const bySlug = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };

  for (const record of records) {
    const id = typeof record.id === "string" ? record.id : "";
    if (id) add(byId, id, record.path);
    add(bySlug, slugOf(record.path), record.path);
  }

  const refs = {};
  let resolved = 0;
  let ambiguous = 0;
  let freeText = 0;

  for (const record of records) {
    for (const key of keys) {
      const raw = record[key];
      if (raw === undefined || raw === null) continue;
      const values = Array.isArray(raw) ? raw : [raw];

      for (const value of values) {
        if (typeof value !== "string") continue;
        if (!refs[record.path]) refs[record.path] = [];
        const tokens = value.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g) || [];

        for (const token of tokens) {
          // Free-text noise is not a slug: bare numbers ("72") and very short tokens
          // ("us", "br") resolve by accident into real documents and pollute the graph.
          if (/^\d+$/.test(token) || token.length < 3) continue;
          const hits = new Set([...(byId.get(token) || []), ...(bySlug.get(token) || [])]);
          const candidates = [...hits];
          if (candidates.length === 0) {
            freeText++;
            continue;
          }
          const dir = dirOf(record.path);
          const here = candidates.filter((candidate) => dirOf(candidate) === dir);
          const winner = here.length === 1 ? here[0] : candidates.length === 1 ? candidates[0] : null;

          if (winner) {
            resolved++;
            if (!refs[record.path]) refs[record.path] = [];
            refs[record.path].push({ key, value, resolved: winner, candidates: [] });
          } else {
            ambiguous++;
            if (!refs[record.path]) refs[record.path] = [];
            refs[record.path].push({
              key,
              value,
              resolved: null,
              candidates: (here.length > 1 ? here : candidates).sort(),
            });
          }
        }
      }
    }
  }

  return { resolved, ambiguous, freeText, refs };
}

/** Escapes the pipes of a markdown table cell. */
function cell(text) {
  return String(text ?? "").replace(/\|/g, "\\|");
}

/** Cuts a gist to 120 characters at a word boundary, without an ellipsis. */
export function cut(text, limit) {
  const value = String(text ?? "");
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return space > 0 ? cut.slice(0, space) : cut;
}

/**
 * Renders the map of a directory: the table of its documents and the list of
 * its subdirectories.
 *
 * @param {string} dir — the directory, relative to the project root; "" is the root.
 * @param {Record<string, unknown>[]} records — the documents of the directory.
 * @param {{ dir: string, count: number, map?: boolean }[]} children — the subdirectories.
 * @param {number} gistMaxChars — how long the gist of a row may be.
 * @returns {string} the markdown of the map.
 */
export function renderMap(dir, records, children, gistMaxChars = 120) {
  const rows = [...records].sort((a, b) => {
    const keyA = a.id || a.path;
    const keyB = b.id || b.path;
    if (keyA !== keyB) return keyA < keyB ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  const lines = [
    `# ${dir === "" ? "." : dir}`,
    "",
    `${rows.length} documents.`,
    "",
    "| ID | Title | Gist | Anchor | File |",
    "|---|---|---|---|---|",
  ];

  for (const record of rows) {
    const anchor = record.anchor && record.anchor.heading ? `§${record.anchor.heading}` : "";
    lines.push(
      `| ${cell(record.id)} | ${cell(record.title)} | ${cell(cut(record.gist, gistMaxChars))} | ${cell(anchor)} | ${cell(record.path)} |`,
    );
  }

  if (children && children.length) {
    lines.push("");
    for (const child of children) {
      const name = posix.basename(child.dir);
      if (child.map === false) {
        lines.push(`- ${child.dir} — ${child.count} documents (no map: a single document)`);
        continue;
      }
      lines.push(`- [${child.dir}](${name}/INDEX.md) — ${child.count} documents`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Builds the maps of the corpus: one map per directory that holds documents.
 *
 * A directory with a single document gets no map of its own — the row moves
 * to the map of its nearest ancestor, but the directory stays visible in the
 * child list of that ancestor. The root map lists the top level.
 *
 * @param {Record<string, unknown>[]} records — every record of the corpus.
 * @param {number} gistMaxChars — how long the gist of a row may be.
 * @returns {Map<string, string>} directory path -> markdown of its map.
 */
export function buildMaps(records, gistMaxChars = 120) {
  const own = new Map();
  const counts = new Map();
  for (const record of records) {
    const dir = dirOf(record.path);
    if (!own.has(dir)) own.set(dir, []);
    own.get(dir).push(record);
    counts.set(dir, (counts.get(dir) || 0) + 1);
  }

  // Deepest directories first: a lonely row moves up until its directory
  // holds at least two documents.
  const rows = new Map(own);
  let moved = true;
  while (moved) {
    moved = false;
    const dirs = [...rows.keys()].sort((a, b) => b.split("/").length - a.split("/").length);
    for (const dir of dirs) {
      if (dir === "") continue;
      const list = rows.get(dir);
      if (!list || list.length !== 1) continue;
      const parent = dirOf(dir);
      if (!rows.has(parent)) rows.set(parent, []);
      rows.get(parent).push(...list);
      rows.set(dir, []);
      moved = true;
    }
  }

  const maps = new Map();
  for (const [dir, list] of rows) {
    if (list.length === 0 && dir !== "") continue;
    const children = [];
    for (const other of rows.keys()) {
      if (other === dir || other === "") continue;
      if (dirOf(other) !== dir) continue;
      const count = counts.get(other) || 0;
      children.push({ dir: other, count, map: (rows.get(other) || []).length > 0 });
    }
    children.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
    maps.set(dir, renderMap(dir, list, children, gistMaxChars));
  }

  return maps;
}

/** The fields of a record that the search reads, with their weights. */
const SEARCH_FIELDS = [
  ["id", 5],
  ["title", 4],
  ["gist", 3],
  ["heading", 2],
  ["path", 1],
];

/** The text of a searchable field of a record. */
function fieldText(record, field) {
  if (field === "heading") {
    return record.anchor && typeof record.anchor.heading === "string" ? record.anchor.heading : "";
  }
  return typeof record[field] === "string" ? record[field] : "";
}

/** The words of a text; hyphens stay inside a word, so "REQ-018" is one word. */
function wordsOf(text) {
  return String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean);
}

/** The weight of a query word in a record, 0 when the word is not there. */
function wordWeight(record, word) {
  const target = word.toLowerCase();
  for (const [field, weight] of SEARCH_FIELDS) {
    const text = fieldText(record, field);
    if (text && wordsOf(text).includes(target)) return weight;
  }
  if (target.length >= 4) {
    const stem = target.slice(0, -1);
    for (const [field, weight] of SEARCH_FIELDS) {
      const text = fieldText(record, field);
      if (text && wordsOf(text).some((w) => w.startsWith(stem))) return weight;
    }
  }
  return 0;
}

/**
 * Searches the corpus by the face of its documents: id, title, gist, anchor
 * and path. Every word of the query must be found.
 *
 * @param {Record<string, unknown>[]} records — every record of the corpus.
 * @param {string} query — the query.
 * @returns {Array<{ path: string, id: string, title: string, gist: string, anchor: unknown, score: number }>}
 */
export function searchIndex(records, query) {
  const terms = String(query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const hits = [];

  for (const record of records) {
    let score = 0;
    let matched = true;
    for (const term of terms) {
      const weight = wordWeight(record, term);
      if (weight === 0) {
        matched = false;
        break;
      }
      score += weight;
    }
    if (!matched) continue;
    hits.push({
      path: record.path,
      id: record.id,
      title: record.title,
      status: record.status,
      docType: record.docType,
      gist: record.gist,
      anchor: record.anchor,
      score,
    });
  }

  hits.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  return hits;
}

/**
 * The sections of a body: every ATX heading of any level starts one, the text
 * before the first heading is a section with an empty heading. Lines inside
 * fenced code blocks do not start sections, but belong to the section text —
 * a code identifier is a legitimate search term.
 *
 * The line of a section is absolute: the line of its heading in the file.
 *
 * @param {string} body — the body of a document.
 * @param {number} bodyStartLine — the 1-based line of the body in the file.
 * @returns {Array<{ heading: string, line: number, text: string }>}
 */
export function extractSections(body, bodyStartLine = 1) {
  const lines = String(body ?? "").split("\n");
  const inside = fencedLines(lines);
  const sections = [];
  let current = { heading: "", line: 0, text: [] };

  const flush = () => {
    const text = current.text.join("\n").trim();
    if (text) sections.push({ heading: current.heading, line: current.line, text });
  };

  for (let i = 0; i < lines.length; i++) {
    const match = inside[i] ? null : /^(#{1,6})\s+(.*)$/.exec(stripCr(lines[i]));
    if (match) {
      flush();
      current = { heading: match[2].trim(), line: bodyStartLine + i, text: [] };
    } else {
      current.text.push(lines[i]);
    }
  }
  flush();

  return sections;
}

/**
 * The term frequencies of a text: the words of `wordsOf` that are two
 * characters or longer. No stop-word list — the rare words rank themselves
 * through IDF.
 *
 * @param {string} text
 * @returns {Record<string, number>}
 */
export function sectionTerms(text) {
  // Null-prototype: слова текста вроде "constructor" коллидируют с ключами
  // Object.prototype — (terms[word] || 0) подмешал бы унаследованную функцию,
  // len стал бы NaN и BM25-скоринг молча опустошал бы весь body-поиск
  // (воспроизводится на любой секции, где встречается слово "constructor").
  const terms = Object.create(null);
  for (const word of wordsOf(text)) {
    if (word.length < 2) continue;
    terms[word] = (terms[word] || 0) + 1;
  }
  return terms;
}

/** A section longer than this gives its first words only: the terms of an
 *  appendix-sized section flood the artifact without adding recall. */
const SECTION_TEXT_LIMIT = 6000;

/** Cuts a text at a word boundary, never inside a word. */
function clampSectionText(text) {
  if (text.length <= SECTION_TEXT_LIMIT) return text;
  const cut = text.slice(0, SECTION_TEXT_LIMIT);
  const space = cut.lastIndexOf(" ");
  return space > 0 ? cut.slice(0, space) : cut;
}

/**
 * The section statistics of one document — the derived artifact of the body
 * search. The body itself is never copied: only per-section term counts,
 * a heading and a line.
 *
 * @param {string} path — the path of the document, relative to the root.
 * @param {string} content — the whole document.
 * @returns {{ path: string, sections: Array<{ h: string, line: number, terms: Record<string, number> }> } | null}
 *   null when the document holds no indexable section.
 */
export function buildSections(path, content) {
  const { body, bodyStartLine } = parseFrontmatter(content);
  const sections = extractSections(body, bodyStartLine)
    .map((section) => ({
      h: section.heading,
      line: section.line,
      terms: sectionTerms(`${section.heading}\n${clampSectionText(section.text)}`),
    }))
    .filter((section) => Object.keys(section.terms).length > 0);
  if (!sections.length) return null;
  return { path, sections };
}

/** The total number of tokens a term-frequency map holds. */
function termsLength(terms) {
  let total = 0;
  for (const key in terms) total += terms[key];
  return total;
}

/**
 * The count of a query term in a section: the exact word, or — as in the face
 * search — any word that starts with the query term without its last
 * character. The first word that matches gives the count.
 */
function sectionTf(terms, term, stem) {
  if (terms[term]) return terms[term];
  if (!stem) return 0;
  for (const word in terms) {
    if (word.startsWith(stem)) return terms[word];
  }
  return 0;
}

/** The fields of a record that the body search reads for the face presence. */
const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * The two-tier search: the face hits first (searchIndex, unchanged), then the
 * documents that hold every query word somewhere in their body sections but
 * not on their face. The body hits are ranked by BM25 over the sections of a
 * document; the anchor of a body hit is its best section.
 *
 * Every query word must be found: in the body sections of the document or on
 * its face. A word found only on the face ranks the document through its
 * sections alone — a document without a matching section does not appear.
 *
 * @param {Record<string, unknown>[]} records — every record of the corpus.
 * @param {{ docs: Array<{ path: string, sections: Array<{ h: string, line: number, terms: Record<string, number> }> }> } | null} stats
 *   the section statistics; null turns the body tier off.
 * @param {string} query — the query.
 * @returns {{ face: Array<object>, body: Array<object> }}
 */
export function searchWithBody(records, stats, query) {
  const face = searchIndex(records, query);

  const terms = [...new Set(String(query ?? "").split(/\s+/).filter(Boolean))];
  if (!stats || !Array.isArray(stats.docs) || !stats.docs.length || !terms.length) {
    return { face, body: [] };
  }
  const queryTerms = terms.map((term) => ({
    term: term.toLowerCase(),
    stem: term.length >= 4 ? term.toLowerCase().slice(0, -1) : "",
  }));

  const byPath = new Map(records.map((record) => [record.path, record]));
  const faceSet = new Set(face.map((hit) => hit.path));

  // First pass: the section lengths, the document-level presence of every
  // query term and the document frequency of each term.
  let totalLength = 0;
  let sectionCount = 0;
  const df = new Map(queryTerms.map(({ term }) => [term, 0]));
  const docs = [];

  for (const entry of stats.docs) {
    const record = byPath.get(entry.path);
    if (!record) continue;
    const sections = (entry.sections || []).map((section) => ({
      h: String(section.h ?? ""),
      line: Number(section.line) || 0,
      terms: section.terms && typeof section.terms === "object" ? section.terms : {},
      len: termsLength(section.terms || {}),
    }));
    if (!sections.length) continue;

    const present = new Set();
    for (const section of sections) {
      for (const { term, stem } of queryTerms) {
        if (!present.has(term) && sectionTf(section.terms, term, stem)) present.add(term);
      }
    }
    for (const term of present) df.set(term, df.get(term) + 1);

    totalLength += sections.reduce((sum, section) => sum + section.len, 0);
    sectionCount += sections.length;
    docs.push({ record, sections, present });
  }

  const body = [];
  if (!docs.length || !sectionCount) return { face, body };
  const avgLength = totalLength / sectionCount;
  const idfOf = (term) => Math.log((docs.length - df.get(term) + 0.5) / (df.get(term) + 0.5) + 1);

  // Second pass: the documents that the face search missed but whose body
  // holds every query word. Ranked by the best section score.
  for (const doc of docs) {
    if (faceSet.has(doc.record.path)) continue;

    let allFound = true;
    for (const { term } of queryTerms) {
      if (doc.present.has(term)) continue;
      if (wordWeight(doc.record, term) > 0) continue;
      allFound = false;
      break;
    }
    if (!allFound) continue;

    let best = null;
    for (const section of doc.sections) {
      let score = 0;
      for (const { term, stem } of queryTerms) {
        const tf = sectionTf(section.terms, term, stem);
        if (!tf) continue;
        score += idfOf(term) * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (section.len / avgLength))));
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { heading: section.h, line: section.line, score };
      }
    }
    if (!best) continue;

    body.push({
      path: doc.record.path,
      id: doc.record.id,
      title: doc.record.title,
      status: doc.record.status,
      docType: doc.record.docType,
      gist: doc.record.gist,
      anchor: { heading: best.heading, line: best.line },
      score: best.score,
    });
  }

  body.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  return { face, body };
}

/** The directed edges of the corpus: markdown links and resolved relations. */
export function buildGraph(records) {
  const byPath = new Map(records.map((record) => [record.path, record]));
  const edges = [];
  const seen = new Set();
  for (const record of records) {
    for (const target of record.links || []) {
      edges.push({ from: record.path, to: target, kind: "link", key: "link" });
    }
    for (const ref of record.refs || []) {
      if (ref.resolved) edges.push({ from: record.path, to: ref.resolved, kind: "ref", key: ref.key });
    }
  }
  const unique = [];
  for (const edge of edges) {
    const mark = `${edge.from}\u0000${edge.to}\u0000${edge.kind}\u0000${edge.key}`;
    if (seen.has(mark)) continue;
    seen.add(mark);
    unique.push(edge);
  }
  return { records, byPath, edges: unique };
}

/**
 * The neighbours of a document in the graph: every document it points at and
 * every document that points at it, with the relations that connect them.
 * Mutual neighbours come first, then those with the most relations.
 *
 * @param {string} path — the path of the document.
 * @param {{ records: object[], byPath: Map<string, object>, edges: Array<{ from: string, to: string, kind: string, key: string }> }} graph
 * @returns {Array<{ path: string, relations: Array<{ dir: string, kind: string, key: string }>, mutual: boolean }>}
 */
export function relatedOf(path, graph) {
  const neighbors = new Map();
  const add = (other, dir, kind, key) => {
    if (other === path) return;
    if (!neighbors.has(other)) neighbors.set(other, { path: other, relations: [], mutual: false });
    neighbors.get(other).relations.push({ dir, kind, key });
  };

  for (const edge of graph.edges) {
    if (edge.from === path) add(edge.to, "out", edge.kind, edge.key);
    if (edge.to === path) add(edge.from, "in", edge.kind, edge.key);
  }

  const list = [...neighbors.values()];
  for (const neighbor of list) {
    const out = neighbor.relations.some((relation) => relation.dir === "out");
    const in_ = neighbor.relations.some((relation) => relation.dir === "in");
    neighbor.mutual = out && in_;
    neighbor.relations.sort((a, b) =>
      a.dir === b.dir ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.dir === "out" ? -1 : 1,
    );
  }
  list.sort((a, b) => {
    if (a.mutual !== b.mutual) return a.mutual ? -1 : 1;
    if (a.relations.length !== b.relations.length) return b.relations.length - a.relations.length;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return list;
}

/**
 * Resolves an argument of the CLI to a document: the exact path, the path
 * without the extension, a unique `id`, or a unique file slug. An ambiguous
 * `id` or slug is never guessed — the candidates come back.
 *
 * @param {Record<string, unknown>[]} records — every record of the corpus.
 * @param {string} arg — the argument of the command.
 * @returns {{ path: string } | { error: string, value: string, candidates: string[] }}
 */
export function resolveTarget(records, arg) {
  const target = String(arg ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (records.some((record) => record.path === target)) return { path: target };
  if (records.some((record) => record.path === `${target}.md`)) return { path: `${target}.md` };

  const byId = records.filter((record) => record.id === target);
  if (byId.length === 1) return { path: byId[0].path };
  if (byId.length > 1) {
    return { error: "ambiguous", value: target, candidates: byId.map((record) => record.path).sort() };
  }

  const slug = posix.basename(target, posix.extname(target));
  const bySlug = records.filter((record) => slugOf(record.path) === slug);
  if (bySlug.length === 1) return { path: bySlug[0].path };
  if (bySlug.length > 1) {
    return { error: "ambiguous", value: target, candidates: bySlug.map((record) => record.path).sort() };
  }

  return { error: "unknown", value: target, candidates: [] };
}

/** The adjacency of the graph: every node with its neighbours, sorted.
 *  The edges the node authored come first, so a traversal shows the relation
 *  in the direction it was written in. */
function adjacencyOf(graph) {
  const adj = new Map();
  const add = (node, entry) => {
    if (!adj.has(node)) adj.set(node, []);
    adj.get(node).push(entry);
  };
  for (const edge of graph.edges) {
    add(edge.from, { neighbor: edge.to, edge, own: true });
    add(edge.to, { neighbor: edge.from, edge, own: false });
  }
  for (const [node, list] of adj) {
    list.sort((a, b) => {
      if (a.own !== b.own) return a.own ? -1 : 1;
      return a.neighbor < b.neighbor ? -1 : a.neighbor > b.neighbor ? 1 : 0;
    });
  }
  return adj;
}

/**
 * The shortest chain of documents between two nodes of the graph, breadth
 * first over the undirected edges. Each step keeps the edge it used, so the
 * caller can show the relation and its direction.
 *
 * @param {string} fromPath
 * @param {string} toPath
 * @param {{ records: object[], byPath: Map<string, object>, edges: Array<{ from: string, to: string, kind: string, key: string }> }} graph
 * @returns {Array<{ from: string, to: string, edge: { from: string, to: string, kind: string, key: string } }> | null}
 *   null when the graph holds no chain between the two documents.
 */
export function shortestPath(fromPath, toPath, graph) {
  if (fromPath === toPath) return [];
  const adj = adjacencyOf(graph);
  const prev = new Map([[fromPath, null]]);
  const queue = [fromPath];

  while (queue.length) {
    const current = queue.shift();
    for (const { neighbor, edge } of adj.get(current) || []) {
      if (prev.has(neighbor)) continue;
      prev.set(neighbor, { from: current, edge });
      if (neighbor === toPath) {
        const steps = [];
        let node = toPath;
        while (prev.get(node)) {
          const step = prev.get(node);
          steps.unshift({ from: step.from, to: node, edge: step.edge });
          node = step.from;
        }
        return steps;
      }
      queue.push(neighbor);
    }
  }
  return null;
}

/**
 * Compares the index with the disk: what changed, what was added, what is
 * missing from the disk.
 *
 * @param {Record<string, unknown>[]} index — the records of the index.
 * @param {{ path: string, hash: string }[]} disk — the documents on the disk.
 * @returns {{ changed: string[], added: string[], missing: string[] }}
 */
export function compareIndex(index, disk) {
  const diskHashes = new Map(disk.map((entry) => [entry.path, entry.hash]));
  const indexed = new Set(index.map((record) => record.path));
  const changed = [];
  const missing = [];

  for (const record of index) {
    const hash = diskHashes.get(record.path);
    if (hash === undefined) missing.push(record.path);
    else if (hash !== record.hash) changed.push(record.path);
  }

  const added = disk.filter((entry) => !indexed.has(entry.path)).map((entry) => entry.path);

  return { changed: changed.sort(), added: added.sort(), missing: missing.sort() };
}
