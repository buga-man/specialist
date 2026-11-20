/**
 * Tests for skills/kb-index/scripts/kb.mjs — the CLI of the kb-index skill.
 * Run: node --test skills/kb-index/scripts/kb.mjs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const KB = join(HERE, "kb.mjs");
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Temp project dir; files are created by path ("/"-separated keys). */
function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kb-cli-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function kb(dir, ...args) {
  return execFileSync(process.execPath, [KB, ...args, "--project", dir], { encoding: "utf8" });
}

const DOC = [
  "---", "id: REQ-001", "title: Collection", "status: draft", "---", "",
  "# REQ-001", "", "## Problem", "Complaints from five channels of the store.",
].join("\n");

test("build: the index and the map are created, the report carries the counters", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  const out = kb(dir, "build");
  assert.match(out, /kb-index: 1 documents, 1 directories/);
  assert.match(out, /gist: 1 usable, 0 empty, 0 boilerplate, 0 short/);
  const map = execFileSync(process.execPath, [KB, "map", "docs/req", "--project", dir], { encoding: "utf8" });
  assert.match(map, /REQ-001/);
});

test("search: finds by the gist and prints the path", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  const out = kb(dir, "search", "complaints");
  assert.match(out, /REQ-001/);
  assert.match(out, /docs\/req\/REQ-001\.md/);
});

test("search: builds the index first when it is absent", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  const out = kb(dir, "search", "complaints");
  assert.match(out, /REQ-001/);
});

test("search: over an already built index — the same result", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  kb(dir, "build");
  const out = kb(dir, "search", "complaints");
  assert.match(out, /REQ-001/);
  assert.match(out, /docs\/req\/REQ-001\.md/);
});

test("audit: finds a duplicate id", () => {
  const doc = (id) => ["---", `id: ${id}`, "title: T", "---", "", "# T", "", "## S", "text"].join("\n");
  const dir = project({ "a/REQ-002.md": doc("SPEC-003"), "b/REQ-002.md": doc("SPEC-003") });
  const out = kb(dir, "audit");
  assert.match(out, /SPEC-003/);
});

test("clean: removes .kbindex", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  kb(dir, "build");
  assert.equal(existsSync(join(dir, ".kbindex")), true);
  kb(dir, "clean");
  assert.equal(existsSync(join(dir, ".kbindex")), false);
});

test("search: prints the anchor line", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  const out = kb(dir, "search", "complaints");
  assert.match(out, /:9\b/);
});

test("build: a directory excluded by config is indexed without its body", () => {
  const brief = ["---", "id: REQ-900", "title: Brief", "---", "", "## Section", "Customer brief text"].join("\n");
  const dir = project({ "docs/req/REQ-001.md": DOC, "docs/source-briefs/brief.md": brief });
  writeFileSync(
    join(dir, ".kbindex.json"),
    JSON.stringify({ exclude: ["**/source-briefs/**"] }),
  );
  kb(dir, "build");
  const index = JSON.parse(readFileSync(join(dir, ".kbindex", "index.json"), "utf8"));
  const record = index.records.find((r) => r.path === "docs/source-briefs/brief.md");
  assert.equal(record.id, "REQ-900");
  assert.equal(record.gist, "");
  assert.equal(record.anchor, null);
});

test("build: the index ignores itself", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  kb(dir, "build");
  assert.equal(readFileSync(join(dir, ".kbindex", ".gitignore"), "utf8").trim(), "*");
});

test("build: a boilerplate line in a list is boilerplate too", () => {
  const doc = ["---", "id: REQ-002", "---", "", "- Date: 2026-11-09 - Status: draft"].join("\n");
  const dir = project({ "docs/req/REQ-002.md": doc });
  const out = kb(dir, "build");
  assert.match(out, /gist: 0 usable, 0 empty, 1 boilerplate, 0 short/);
});

test("invocation: --project without a value — a usage error, not a stack trace", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  const r = spawnSync(process.execPath, [KB, "build", "--project"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr, /TypeError/);
});

// The word "pallets" lives only in the body: the gist — the first paragraph without it,
// the face anchor — the section heading.
const BODY_DOC = [
  "---", "id: REQ-010", "title: Logistics", "status: draft", "---", "",
  "# REQ-010", "",
  "Logistics of the retail chain.",
  "",
  "## Warehouse",
  "The pallets arrive before noon.",
].join("\n");

test("build: sections.json is created, the report carries the section counter", () => {
  const dir = project({ "docs/req/REQ-010.md": BODY_DOC });
  const out = kb(dir, "build");
  assert.match(out, /sections: 2 \(body search\)/);
  const sections = JSON.parse(readFileSync(join(dir, ".kbindex", "sections.json"), "utf8"));
  assert.equal(sections.schema, 1);
  assert.equal(sections.docs.length, 1);
  assert.equal(sections.docs[0].path, "docs/req/REQ-010.md");
  assert.deepEqual(
    sections.docs[0].sections.map((s) => s.h),
    ["REQ-010", "Warehouse"],
  );
});

test("search: a word from the body is found with the section anchor", () => {
  const dir = project({ "docs/req/REQ-010.md": BODY_DOC });
  const out = kb(dir, "search", "pallets");
  assert.match(out, /REQ-010/);
  assert.match(out, /§Warehouse:11/);
});

test("search: the body is searched over the already built index", () => {
  const dir = project({ "docs/req/REQ-010.md": BODY_DOC });
  kb(dir, "build");
  const out = kb(dir, "search", "pallets");
  assert.match(out, /REQ-010/);
});

test("search: without sections.json the search stays face-only", () => {
  const dir = project({ "docs/req/REQ-010.md": BODY_DOC });
  kb(dir, "build");
  rmSync(join(dir, ".kbindex", "sections.json"));
  const out = kb(dir, "search", "pallets");
  assert.equal(out.trim(), "kb-index: no matches");
});

test("build: bodySearch false turns off the body index", () => {
  const dir = project({ "docs/req/REQ-010.md": BODY_DOC });
  writeFileSync(join(dir, ".kbindex.json"), JSON.stringify({ bodySearch: false }));
  const out = kb(dir, "build");
  assert.match(out, /sections: 0 \(body search\)/);
  const sections = JSON.parse(readFileSync(join(dir, ".kbindex", "sections.json"), "utf8"));
  assert.deepEqual(sections.docs, []);
  const out2 = kb(dir, "search", "pallets");
  assert.equal(out2.trim(), "kb-index: no matches");
});

test("build: an excluded document yields no sections", () => {
  const brief = ["---", "id: REQ-900", "title: Brief", "---", "", "## Section", "Secret brief text"].join("\n");
  const dir = project({ "docs/req/REQ-010.md": BODY_DOC, "docs/source-briefs/brief.md": brief });
  writeFileSync(join(dir, ".kbindex.json"), JSON.stringify({ exclude: ["**/source-briefs/**"] }));
  kb(dir, "build");
  const sections = JSON.parse(readFileSync(join(dir, ".kbindex", "sections.json"), "utf8"));
  assert.deepEqual(
    sections.docs.map((d) => d.path),
    ["docs/req/REQ-010.md"],
  );
  const out = kb(dir, "search", "secret");
  assert.equal(out.trim(), "kb-index: no matches");
});

const LINK_A = ["---", "id: REL-A", "title: Source", "---", "", "## One", "See [target](rel-b.md)."].join("\n");
const LINK_B = ["---", "id: REL-B", "title: Target", "parent: REL-A", "---", "", "## Two", "Text."].join("\n");

test("related: links in both directions, mutual ones first", () => {
  const dir = project({ "docs/rel-a.md": LINK_A, "docs/rel-b.md": LINK_B });
  const out = kb(dir, "related", "docs/rel-a.md");
  assert.match(out, /Source  \(docs\/rel-a\.md\)/);
  assert.match(out, /→ link: docs\/rel-b\.md — Target/);
  assert.match(out, /← parent: docs\/rel-b\.md/);
});

test("related: an id and a path without an extension are understood", () => {
  const dir = project({ "docs/rel-a.md": LINK_A, "docs/rel-b.md": LINK_B });
  assert.match(kb(dir, "related", "REL-B"), /Target/);
  assert.match(kb(dir, "related", "docs/rel-b"), /Target/);
});

test("related: an ambiguous id — an error with the candidate list", () => {
  const doc = (id) => ["---", `id: ${id}`, "---", "", "## S", "text"].join("\n");
  const dir = project({ "a/x.md": doc("DUP-1"), "b/y.md": doc("DUP-1") });
  const r = spawnSync(process.execPath, [KB, "related", "DUP-1", "--project", dir], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /matches several documents/);
  assert.match(r.stderr, /a\/x\.md/);
  assert.match(r.stderr, /b\/y\.md/);
});

test("related: no neighbors — empty, but no error", () => {
  const dir = project({ "docs/rel-b.md": LINK_B });
  const out = kb(dir, "related", "docs/rel-b.md");
  assert.match(out, /no related documents/);
});

test("path: a chain between documents with the link direction", () => {
  const dir = project({ "docs/rel-a.md": LINK_A, "docs/rel-b.md": LINK_B });
  const out = kb(dir, "path", "REL-A", "REL-B");
  assert.match(out, /docs\/rel-a\.md/);
  assert.match(out, /→ link → docs\/rel-b\.md/);
  assert.match(out, /1 hop/);
  const back = kb(dir, "path", "REL-B", "REL-A");
  assert.match(back, /→ parent → docs\/rel-a\.md/);
});

test("path: no chain — an error", () => {
  const solo = ["---", "id: SOLO", "---", "", "## S", "text"].join("\n");
  const dir = project({ "docs/rel-a.md": LINK_A, "docs/rel-b.md": LINK_B, "docs/solo.md": solo });
  const r = spawnSync(process.execPath, [KB, "path", "REL-A", "SOLO", "--project", dir], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no chain of documents/);
});

test("path: both arguments point at one document", () => {
  const dir = project({ "docs/rel-a.md": LINK_A });
  const r = spawnSync(process.execPath, [KB, "path", "REL-A", "docs/rel-a.md", "--project", dir], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /same document/);
});

test("build: the second build reuses unchanged documents (incremental)", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC, "docs/req/REQ-002.md": DOC });
  const first = kb(dir, "build");
  assert.doesNotMatch(first, /incremental:/); // no previous index — nothing to reuse
  const second = kb(dir, "build");
  assert.match(second, /incremental: 2 of 2 documents reused/);
  writeFileSync(join(dir, "docs", "req", "REQ-002.md"), `${DOC}\nchanged`);
  const third = kb(dir, "build");
  assert.match(third, /incremental: 1 of 2 documents reused/);
  const fourth = kb(dir, "build");
  assert.match(fourth, /incremental: 2 of 2 documents reused/); // the rebuild refreshed the record
});

test("search: the face carries the pipeline status tag", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC }); // DOC has "status: draft"
  kb(dir, "build");
  const out = kb(dir, "search", "complaints");
  assert.match(out, /\[draft\]/);
});

test("search: a body hit shows the answering line of its best section", () => {
  const dir = project({ "docs/req/REQ-010.md": BODY_DOC });
  const out = kb(dir, "search", "pallets");
  assert.match(out, /The pallets arrive before noon\./); // the line, not just the anchor
});

test("search: a typo in an id gets a did-you-mean line", () => {
  const doc = ["---", "id: REQ-018", "title: Point", "---", "", "## Section", "text"].join("\n");
  const dir = project({ "docs/req/REQ-018.md": doc });
  kb(dir, "build");
  const out = kb(dir, "search", "REQ-081");
  assert.match(out, /no matches/);
  assert.match(out, /did you mean: REQ-018 \(docs\/req\/REQ-018\.md\)\?/);
});

test("search: no matches and nothing within reach — no suggestion", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  const out = kb(dir, "search", "zanzibar");
  assert.equal(out.trim(), "kb-index: no matches");
});

test("search: --status narrows the corpus before the search", () => {
  const draft = ["---", "id: A-1", "status: draft", "---", "", "## S", "warehouse text"].join("\n");
  const done = ["---", "id: A-2", "status: approved", "---", "", "## S", "warehouse text"].join("\n");
  const dir = project({ "docs/a.md": draft, "docs/b.md": done });
  kb(dir, "build");
  assert.match(kb(dir, "search", "warehouse", "--status", "approved"), /A-2/);
  assert.equal(kb(dir, "search", "warehouse", "--status", "review").trim(), "kb-index: no matches");
});

test("search: --json is machine output", () => {
  const dir = project({ "docs/req/REQ-010.md": BODY_DOC });
  const raw = kb(dir, "search", "pallets", "--json");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.query, "pallets");
  assert.equal(parsed.face.length, 0);
  assert.equal(parsed.body.length, 1);
  assert.equal(parsed.body[0].path, "docs/req/REQ-010.md");
  assert.equal(parsed.body[0].snippet.text, "The pallets arrive before noon.");
});

test("search: the tail beyond five hits is paths only", () => {
  const doc = (id) => ["---", `id: ${id}`, "title: T", "---", "", "## S", "warehouse gist text"].join("\n");
  const files = {};
  for (let i = 1; i <= 7; i++) files[`docs/d${i}.md`] = doc(`W-${i}`);
  const dir = project(files);
  kb(dir, "build");
  const out = kb(dir, "search", "warehouse");
  assert.equal(out.match(/^ {7}\S/gm).length, 5); // five full faces — the rest is paths
  assert.match(out, /W-6/);
  assert.match(out, /W-7/);
});

test("search: the cut is announced with the --limit hint", () => {
  const doc = (id) => ["---", `id: ${id}`, "title: T", "---", "", "## S", "warehouse gist text"].join("\n");
  const files = {};
  for (let i = 1; i <= 7; i++) files[`docs/d${i}.md`] = doc(`W-${i}`);
  const dir = project(files);
  kb(dir, "build");
  const out = kb(dir, "search", "warehouse", "--limit", "3");
  assert.match(out, /… and 4 more \(--limit 3\)/);
});

test("related: the neighbor carries its gist", () => {
  const dir = project({ "docs/rel-a.md": LINK_A, "docs/rel-b.md": LINK_B });
  const out = kb(dir, "related", "docs/rel-a.md");
  assert.match(out, /→ link: docs\/rel-b\.md — Target/);
  assert.match(out, /^ {7}Text\./m); // the gist of the neighbor, indented under it
});

test("related: --json is machine output", () => {
  const dir = project({ "docs/rel-a.md": LINK_A, "docs/rel-b.md": LINK_B });
  const parsed = JSON.parse(kb(dir, "related", "REL-A", "--json"));
  assert.equal(parsed.path, "docs/rel-a.md");
  assert.equal(parsed.neighbors.length, 1);
  assert.equal(parsed.neighbors[0].path, "docs/rel-b.md");
  assert.equal(parsed.neighbors[0].gist, "Text.");
});

test("map: --json is the exact directory", () => {
  const dir = project({ "docs/req/REQ-001.md": DOC });
  const parsed = JSON.parse(kb(dir, "map", "docs/req", "--json"));
  assert.equal(parsed.dir, "docs/req");
  assert.equal(parsed.documents[0].id, "REQ-001");
  assert.equal(parsed.documents[0].gist, "Complaints from five channels of the store.");
});
