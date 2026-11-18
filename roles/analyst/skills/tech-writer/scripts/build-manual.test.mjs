/**
 * Tests for build-manual.mjs — Markdown rendering and the manual's HTML assembly.
 * Run: node --test skills/tech-writer/scripts/build-manual.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildHtml, findBrowser, parseFrontMatter, parseArgs, renderMarkdown } from "./build-manual.mjs";

const scriptPath = fileURLToPath(new URL("./build-manual.mjs", import.meta.url));

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
  const { html } = buildHtml(md, { title: "User Guide", version: "v0.1.0", date: "2026-11-08", dir });
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

test("renderMarkdown: arithmetic with spaced asterisks is not italicized, real emphasis still works", () => {
  const html = renderMarkdown("2 * 3 * 4, and 10 * x * y, but *this* is emphasized");
  assert.doesNotMatch(html, /<em> 3 <\/em>/);
  assert.match(html, /2 \* 3 \* 4/);
  assert.match(html, /10 \* x \* y/);
  assert.match(html, /but <em>this<\/em> is emphasized/);
});

test("renderMarkdown: an image and a link target with spaces parse; a spaced image resolves", () => {
  const dir = manual();
  copyFileSync(join(dir, "assets", "p.png"), join(dir, "assets", "my shot 1.png"));
  const images = { found: [], missing: [] };
  const html = renderMarkdown("![Shot](assets/my shot 1.png) then [a link](docs/read me.md)", { dir, images });
  assert.match(html, /<img src="data:image\/png;base64,iVBOR[^"]+" alt="Shot">/);
  assert.match(html, /<a href="docs\/read me\.md">a link<\/a>/);
  assert.deepEqual(images.found, ["assets/my shot 1.png"]);
  assert.deepEqual(images.missing, []);
});

test("buildHtml: returns missing image files as raw paths, single-escaped in the HTML", () => {
  const dir = manual();
  const { html, missing } = buildHtml("![Ok](assets/p.png) then ![Gone](gone & away.png)", { title: "T", dir });
  assert.deepEqual(missing, ["gone & away.png"]);
  assert.match(html, /data:image\/png;base64/); // the existing image is inlined
  assert.match(html, /Missing file: gone &amp; away\.png/); // escaped exactly once
  assert.doesNotMatch(html, /&amp;amp;/); // no double escaping
});

test("buildHtml: an h2 before the first h1 becomes a top-level TOC entry", () => {
  const md = "## Intro\n\ntext\n\n# Chapter one\n\n## Steps\n\n1. do it";
  const { html } = buildHtml(md, { title: "T", dir: "." });
  assert.match(
    html,
    /<ul><li class="t2"><a href="#h-1">Intro<\/a><\/li><li class="t1"><a href="#h-2">Chapter one<\/a><ul><li class="t2"><a href="#h-3">Steps<\/a><\/li><\/ul><\/li><\/ul>/,
  );
});

test("main: a browser that does not produce a PDF exits with code 3, not 2", () => {
  const dir = manual({ "manual.md": "# Chapter\n\ntext" });
  const fakeBrowser = join(dir, "fake-browser");
  writeFileSync(fakeBrowser, "this file exists but is not a browser");
  const res = spawnSync(process.execPath, [scriptPath, dir, "--out", join(dir, "out")], {
    encoding: "utf8",
    env: { ...process.env, MANUAL_BROWSER: fakeBrowser },
    timeout: 60000,
  });
  assert.equal(res.status, 3);
  assert.match(res.stderr, /PDF printing error/);
});
