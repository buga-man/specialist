/**
 * Tests for build-manual.mjs — Markdown rendering and the manual's HTML assembly.
 * Run: node --test skills/tech-writer/scripts/build-manual.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildHtml, findBrowser, parseFrontMatter, parseArgs, renderMarkdown } from "./build-manual.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Temp dir with files created by "/"-separated keys; 1×1 png under "assets/p.png". */
function manual(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "build-manual-"));
  dirs.push(dir);
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "assets", "p.png"), PNG);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test("parseArgs: positional argument, --out/--title/--no-pdf, --help", () => {
  assert.deepEqual(parseArgs(["docs/manual"]), { _: ["docs/manual"], out: null, title: null, pdf: true, help: false });
  const a = parseArgs(["m", "--out", "dist", "--title", "T", "--no-pdf"]);
  assert.deepEqual(a, { _: ["m"], out: "dist", title: "T", pdf: false, help: false });
  assert.equal(parseArgs(["--help"]).help, true);
});

test("parseFrontMatter: title/version/date, no front matter — body unchanged", () => {
  const { meta, body } = parseFrontMatter("---\ntitle: User Guide\nversion: v1.4.0\ndate: 2026-11-08\n---\n\n# Chapter");
  assert.deepEqual(meta, { title: "User Guide", version: "v1.4.0", date: "2026-11-08" });
  assert.equal(body, "\n# Chapter");
  const bare = parseFrontMatter("# Just a heading");
  assert.deepEqual(bare.meta, {});
  assert.equal(bare.body, "# Just a heading");
});

test("renderMarkdown: headings with ids, inline markup, html escaping", () => {
  const html = renderMarkdown("# Heading\n\nText with **bold**, *italic*, `code` and <b>tag</b>\n\n#### H4");
  assert.match(html, /<h1 id="h-1">Heading<\/h1>/);
  assert.match(html, /<h4 id="h-2">H4<\/h4>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /&lt;b&gt;tag&lt;\/b&gt;/);
});

test("renderMarkdown: a list with nesting, a table, a blockquote, a fence with escaping", () => {
  const md = [
    "1. First step",
    "   - detail one",
    "   - detail two",
    "2. Second step",
    "",
    "| Column | Value |",
    "|---|---|",
    "| A | **B** |",
    "",
    "> Note",
    "",
    "```",
    "<script>alert(1)</script>",
    "```",
  ].join("\n");
  const html = renderMarkdown(md);
  assert.match(html, /<ol><li>First step<ul><li>detail one<\/li><li>detail two<\/li><\/ul><\/li><li>Second step<\/li><\/ol>/);
  assert.match(html, /<table><thead><tr><th>Column<\/th><th>Value<\/th><\/tr><\/thead><tbody><tr><td>A<\/td><td><strong>B<\/strong><\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<blockquote><p>Note<\/p><\/blockquote>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("renderMarkdown: an existing image → data URI, a missing one → a placeholder collected into missing", () => {
  const dir = manual();
  const images = { found: [], missing: [] };
  const html = renderMarkdown("![Shot](assets/p.png)\n\n![Gone](assets/gone.png)", { dir, images });
  assert.match(html, /<img src="data:image\/png;base64,iVBOR/);
  assert.match(html, /missing-img/);
  assert.match(html, /Missing file: assets\/gone.png/);
  assert.deepEqual(images.found, ["assets/p.png"]);
  assert.deepEqual(images.missing, ["assets/gone.png"]);
});

test("renderMarkdown: an image and text inside a step do not break the list numbering", () => {
  const dir = manual();
  const md = [
    "1. Open the section",
    "",
    "   ![Form](assets/p.png)",
    "",
    "2. Fill in the fields",
    "",
    "   Note under the step.",
    "",
    "3. Save",
  ].join("\n");
  const html = renderMarkdown(md, { dir });
  assert.match(html, /<ol><li>Open the section<br><img src="data:image\/png;base64,[^"]+" alt="Form"><\/li><li>Fill in the fields<br>Note under the step\.<\/li><li>Save<\/li><\/ol>/);
});

test("buildHtml: a cover with metadata, a TOC with links, inline css", () => {
  const dir = manual();
  const md = "# Chapter one\n\ntext\n\n## Steps\n\n1. do it\n\n# Chapter two\n\ntext";
  const html = buildHtml(md, { title: "User Guide", version: "v0.1.0", date: "2026-11-08", dir });
  assert.match(html, /<div class="title">User Guide<\/div>/);
  assert.match(html, /version v0\.1\.0 · 2026-11-08/);
  assert.match(html, /@page \{ size: A4/);
  assert.match(html, /<a href="#h-1">Chapter one<\/a>/);
  assert.match(html, /<ul><li class="t2"><a href="#h-2">Steps<\/a><\/li><\/ul><\/li>/);
  assert.match(html, /<a href="#h-3">Chapter two<\/a>/);
});

test("findBrowser: returns null or an existing path, does not crash", () => {
  const b = findBrowser();
  assert.ok(b === null || (typeof b === "string" && b.length > 0));
});
