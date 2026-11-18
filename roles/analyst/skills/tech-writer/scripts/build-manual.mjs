#!/usr/bin/env node
/**
 * build-manual.mjs — builds the user manual: Markdown → standalone HTML → PDF.
 *
 * Usage:
 *   node build-manual.mjs <manual-dir> [--out <dir>] [--title <title>] [--no-pdf]
 *
 * Source:    <manual-dir>/manual.md — front matter (title/version/date), chapters are H1 sections.
 *            Images (![alt](path)) are read relative to <manual-dir> and inlined
 *            into the HTML as data URIs; a missing file becomes a visible placeholder + a warning.
 * Result:    <out>/manual.html — self-contained HTML (CSS and images inline, a cover, a TOC);
 *            <out>/manual.pdf  — the HTML printed by a headless browser (Chrome/Edge).
 *
 * Exit codes: 0 — html and pdf built; 2 — html built, pdf skipped (no browser found);
 *             3 — html built, pdf printing failed; 1 — build error.
 * Dependencies: only Node (no npm packages); for PDF — Chrome or Edge, the path can be
 *             set via the MANUAL_BROWSER variable.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

// ---------- CLI ----------

export function parseArgs(argv) {
  const args = { _: [], out: null, title: null, pdf: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--title") args.title = argv[++i];
    else if (a === "--no-pdf") args.pdf = false;
    else if (a === "-h" || a === "--help") args.help = true;
    else args._.push(a);
  }
  return args;
}

// ---------- Markdown ----------

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ESC[c]);
const UNESC = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&amp;": "&" };
const unesc = (s) => s.replace(/&(?:lt|gt|quot|amp);/g, (e) => UNESC[e]);

/** Front matter of the `key: value` form between `---` lines. */
export function parseFrontMatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (km) meta[km[1].toLowerCase()] = km[2].trim();
  }
  return { meta, body: md.slice(m[0].length) };
}

/**
 * Markdown → HTML. A subset sufficient for a manual: headings h1–h4,
 * paragraphs, **bold**, *italic*, `code`, links, images, lists (with one level
 * of nesting), GFM tables, blockquotes, fence blocks, hr.
 * opts: { dir, images: { found: [], missing: [] } } — dir for images, images accumulates the results.
 */
export function renderMarkdown(md, opts = {}) {
  const dir = opts.dir || ".";
  const images = opts.images || { found: [], missing: [] };

  // src/alt arrive raw (unescaped here at the call sites) so that file
  // resolution and the found/missing arrays hold the real paths.
  function imageTag(src, alt) {
    if (/^(https?:|data:)/.test(src)) return `<img src="${esc(src)}" alt="${esc(alt)}">`;
    const abs = resolve(dir, src);
    if (existsSync(abs) && statSync(abs).isFile()) {
      images.found.push(src);
      const ext = /\.jpe?g$/i.test(src) ? "image/jpeg" : /\.gif$/i.test(src) ? "image/gif" : /\.svg$/i.test(src) ? "image/svg+xml" : "image/png";
      const data = readFileSync(abs).toString("base64");
      return `<img src="data:${ext};base64,${data}" alt="${esc(alt)}">`;
    }
    images.missing.push(src);
    return `<span class="missing-img">📷 Missing file: ${esc(src)} — ${esc(alt)}</span>`;
  }

  function inline(text) {
    let s = esc(text);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => (codes.push(c), `\x00${codes.length - 1}\x00`));
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => imageTag(unesc(src.trim()), unesc(alt)));
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, href) => `<a href="${esc(unesc(href.trim()))}">${t}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Emphasis needs a non-space right after the opening and before the closing
    // asterisk, so that arithmetic like "2 * 3 * 4" stays literal.
    s = s.replace(/\*(\S(?:[^*]*\S)?)\*/g, "<em>$1</em>");
    s = s.replace(/\x00(\d+)\x00/g, (_, n) => `<code>${codes[n]}</code>`);
    return s;
  }

  const hId = (() => { let h = 0; return () => `h-${++h}`; })();
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const isListItem = (l) => /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
  const isTableRow = (l) => /^\|.*\|\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    // Code fence block
    if (/^```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++; // the closing ```
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading
    const hm = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hm) {
      const level = hm[1].length;
      out.push(`<h${level} id="${hId()}">${inline(hm[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // HR
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote><p>${body.map(inline).join("<br>")}</p></blockquote>`);
      continue;
    }

    // List (one nesting level by indentation; indented non-list
    // lines continue the current item and do not break the numbering)
    if (isListItem(line)) {
      const items = [];
      while (i < lines.length) {
        const m = isListItem(lines[i]);
        if (m) {
          items.push({ level: m[1].length >= 2 ? 1 : 0, ordered: /\d/.test(m[2]), parts: [m[3]] });
          i++;
        } else if (!lines[i].trim()) {
          // Empty lines continue the list if a list item or an indented continuation follows
          let j = i;
          while (j < lines.length && !lines[j].trim()) j++;
          if (!(j < lines.length && (isListItem(lines[j]) || /^\s{2,}\S/.test(lines[j])))) break;
          i = j;
        } else if (items.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1].parts.push(lines[i].trim());
          i++;
        } else break;
      }
      const renderParts = (it) => it.parts.map(inline).join("<br>");
      const render = (level, ordered) => {
        const tag = ordered ? "ol" : "ul";
        const inner = [];
        let j = 0;
        while (j < items.length) {
          if (items[j].level !== level) { j++; continue; }
          let html = `<li>${renderParts(items[j])}</li>`;
          if (j + 1 < items.length && items[j + 1].level > level) {
            let k = j + 1;
            const subItems = [];
            while (k < items.length && items[k].level > level) { subItems.push(items[k]); k++; }
            const innerTag = subItems.some((it) => it.ordered) ? "ol" : "ul";
            html = html.replace("</li>", `<${innerTag}>${subItems.map((it) => `<li>${renderParts(it)}</li>`).join("")}</${innerTag}></li>`);
            j = k;
          } else { j++; }
          inner.push(html);
        }
        return `<${tag}>${inner.join("")}</${tag}>`;
      };
      out.push(render(0, items.filter((it) => it.level === 0).some((it) => it.ordered)));
      continue;
    }

    // GFM table
    if (isTableRow(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const cells = (l) => l.replace(/^\||\|\s*$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
      const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
      continue;
    }

    // Empty line
    if (!line.trim()) { i++; continue; }

    // Paragraph
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*>|\s*[-*+]\s|\s*\d+[.)]\s|\|)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    else i++; // guard against looping on an unrecognized line
  }

  return out.join("\n");
}

// ---------- Document HTML ----------

const CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11pt; line-height: 1.55; color: #1a1a1a; margin: 0; padding: 24px; }
h1 { font-size: 20pt; color: #1f3864; border-bottom: 2px solid #1f3864; padding-bottom: 4pt; page-break-before: always; margin-top: 0; }
h2 { font-size: 15pt; color: #2f5496; margin-top: 18pt; }
h3, h4 { font-size: 12.5pt; color: #2f5496; }
p, li { orphans: 2; widows: 2; }
img { max-width: 100%; border: 1px solid #c9c9c9; border-radius: 4px; padding: 2px; background: #fff; }
pre { background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 8pt; font-size: 9pt; white-space: pre-wrap; page-break-inside: avoid; }
code { background: #f0f0f0; border-radius: 3px; padding: 1px 4px; font-size: 0.92em; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #2f5496; margin-left: 0; padding: 2pt 12pt; color: #444; background: #f7f9fc; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
th, td { border: 1px solid #999; padding: 4pt 8pt; font-size: 10pt; text-align: left; }
th { background: #eef2f8; }
tr { page-break-inside: avoid; }
hr { border: none; border-top: 1px solid #ccc; }
a { color: #2f5496; text-decoration: none; }
.cover { text-align: center; page-break-after: always; }
.cover .title { font-size: 26pt; font-weight: 600; color: #1f3864; margin-top: 30%; }
.cover .meta { color: #555; margin-top: 14pt; }
.toc { page-break-after: always; }
.toc h1 { page-break-before: avoid; }
.toc ul { list-style: none; padding-left: 0; }
.toc ul ul { padding-left: 18pt; }
.toc li { margin: 3pt 0; }
.missing-img { display: block; border: 2px dashed #c00; color: #c00; padding: 10pt; margin: 8pt 0; background: #fff5f5; }
`;

/** Assembles the full HTML: cover + table of contents + content.
 *  Returns { html, missing } — missing lists image files that were not found (raw paths). */
export function buildHtml(bodyMd, { title, version, date, dir }) {
  const images = { found: [], missing: [] };
  const content = renderMarkdown(bodyMd, { dir, images });

  const toc = [];
  for (const m of content.matchAll(/<h([12]) id="(h-\d+)">(.*?)<\/h\1>/g)) {
    const entry = `<li class="t${m[1]}"><a href="#${m[2]}">${m[3].replace(/<[^>]+>/g, "")}</a></li>`;
    if (m[1] === "1") toc.push(entry);
    else if (toc.length) toc[toc.length - 1] = toc[toc.length - 1].replace(/<\/li>$/, `<ul>${entry}</ul></li>`);
    else toc.push(entry); // an h2 before the first h1 — a top-level entry of its own
  }
  const tocHtml = toc.length ? `<nav class="toc"><h1 id="h-toc">Contents</h1><ul>${toc.join("")}</ul></nav>` : "";

  const metaBits = [version && `version ${esc(version)}`, date && esc(date)].filter(Boolean).join(" · ");
  const metaHtml = metaBits ? `<div class="meta">${metaBits}</div>` : "";

  const missingNote = images.missing.length ? `\n<!-- missing image files: ${images.missing.join(", ")} -->` : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="cover"><div class="title">${esc(title)}</div>${metaHtml}</header>
${tocHtml}
<main>
${content}
</main>
${missingNote}</body>
</html>`;
  return { html, missing: images.missing };
}

// ---------- PDF (headless Chrome/Edge) ----------

export function findBrowser() {
  const candidates = [];
  if (process.env.MANUAL_BROWSER) candidates.push(process.env.MANUAL_BROWSER);
  const isWin = process.platform === "win32";
  const bases = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LocalAppData].filter(Boolean);
  for (const base of bases) {
    if (isWin) {
      candidates.push(join(base, "Google", "Chrome", "Application", "chrome.exe"));
      candidates.push(join(base, "Microsoft", "Edge", "Application", "msedge.exe"));
    } else if (base === "/usr") {
      candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/microsoft-edge");
    }
  }
  if (!isWin) candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  for (const c of candidates) if (c && existsSync(c)) return c;
  // Last resort — PATH
  const probe = spawnSync(isWin ? "where" : "which", isWin ? ["chrome", "msedge"] : ["google-chrome", "chromium"], { encoding: "utf8" });
  if (probe.status === 0) {
    const hit = probe.stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => l && existsSync(l));
    if (hit) return hit;
  }
  return null;
}

function fileUrl(p) {
  return encodeURI(`file:///${p.replace(/\\/g, "/")}`).replace(/#/g, "%23");
}

// ---------- main ----------

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args._.length) {
    console.log("Usage: node build-manual.mjs <manual-dir> [--out <dir>] [--title <title>] [--no-pdf]");
    process.exit(args.help ? 0 : 1);
  }

  const manualDir = resolve(args._[0]);
  const source = join(manualDir, "manual.md");
  if (!existsSync(source)) {
    console.error(`Error: ${source} not found (the manual source is manual.md inside the manual directory)`);
    process.exit(1);
  }

  const { meta, body } = parseFrontMatter(readFileSync(source, "utf8"));
  const title = args.title || meta.title || "User Guide";
  const version = meta.version || "";
  const date = meta.date || new Date().toISOString().slice(0, 10);

  const outDir = resolve(args.out || manualDir);
  mkdirSync(outDir, { recursive: true });

  const { html, missing } = buildHtml(body, { title, version, date, dir: manualDir });
  const htmlPath = join(outDir, "manual.html");
  writeFileSync(htmlPath, html);
  console.log(`OK       html → ${htmlPath}`);

  // Missing images are already visible as placeholders in the HTML; repeat them to the console.
  const warnings = missing.map((src) => `missing image file: ${src}`);

  if (!args.pdf) process.exit(0);

  const browser = findBrowser();
  if (!browser) {
    console.warn(`WARN     no browser found (Chrome/Edge; set MANUAL_BROWSER=<path>) — PDF skipped`);
    process.exit(2);
  }
  const pdfPath = join(outDir, "manual.pdf");
  const res = spawnSync(browser, [
    "--headless", "--disable-gpu", "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    fileUrl(htmlPath),
  ], { encoding: "utf8", timeout: 120000 });

  if (res.error || !existsSync(pdfPath)) {
    console.error(`PDF printing error (${basename(browser)}): ${res.error?.message || res.stderr?.slice(0, 400) || "file not created"}`);
    process.exit(3); // distinct from 2 = no browser found: here a browser ran and failed
  }
  console.log(`OK       pdf  → ${pdfPath} (via ${basename(browser)})`);

  if (warnings.length) {
    console.warn("Warnings:");
    for (const w of warnings) console.warn(`  - ${w}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
