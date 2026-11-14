/**
 * Tests for kb-core.mjs — the core of the kb-index skill.
 * Run: node --test skills/kb-index/scripts/lib/kb-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  buildMaps,
  buildRecord,
  buildSections,
  compareIndex,
  extractAnchor,
  extractGist,
  brokenLinks,
  extractLinks,
  extractSections,
  isExcluded,
  parseFrontmatter,
  relatedOf,
  renderMap,
  resolveRefs,
  resolveTarget,
  searchIndex,
  searchWithBody,
  selectPaths,
  sectionTerms,
  shortestPath,
} from "./kb-core.mjs";

test("frontmatter: flat scalars, quotes are stripped", () => {
  const r = parseFrontmatter(
    ["---", "id: SPEC-001", 'title: "Data loading"', "status: draft", "---", "", "body"].join("\n"),
  );
  assert.equal(r.data.id, "SPEC-001");
  assert.equal(r.data.title, "Data loading");
  assert.equal(r.data.status, "draft");
  assert.equal(r.body, "\nbody");
  assert.equal(r.bodyStartLine, 6);
});

test("frontmatter: inline list and block list", () => {
  const r = parseFrontmatter(
    ["---", "children: [SPEC-002, SPEC-003]", "br:", "  - REQ-001", "  - REQ-002", "---", "body"].join("\n"),
  );
  assert.deepEqual(r.data.children, ["SPEC-002", "SPEC-003"]);
  assert.deepEqual(r.data.br, ["REQ-001", "REQ-002"]);
});

test("frontmatter: nested map and block scalar", () => {
  const r = parseFrontmatter(
    ["---", "coverage:", "  code: full", "  tests: none", "note: |", "  line one", "  line two", "---", "body"].join("\n"),
  );
  assert.deepEqual(r.data.coverage, { code: "full", tests: "none" });
  assert.equal(r.data.note, "line one\nline two");
});

test("frontmatter: without frontmatter the body stays intact", () => {
  const r = parseFrontmatter("# just text\n");
  assert.deepEqual(r.data, {});
  assert.equal(r.body, "# just text\n");
  assert.equal(r.bodyStartLine, 1);
});

test("frontmatter: an unclosed block — the body stays intact", () => {
  const r = parseFrontmatter("---\nid: X\nnever closed\n");
  assert.deepEqual(r.data, {});
  assert.equal(r.body, "---\nid: X\nnever closed\n");
});

test("gist: description takes priority over the body", () => {
  assert.equal(extractGist("body", { description: "From description" }), "From description");
  assert.equal(extractGist("body", { summary: "From summary" }), "From summary");
});

test("gist: a quote, a table and a table of contents are skipped", () => {
  const body = [
    "> a quote with a link",
    "",
    "| a | b |",
    "",
    "- item one",
    "- item two",
    "- item three",
    "",
    "A meaningful first paragraph.",
  ].join("\n");
  assert.equal(extractGist(body, {}), "A meaningful first paragraph.");
});

test("gist: no prose — empty", () => {
  assert.equal(extractGist("> only a quote\n\n| a |\n", {}), "");
  assert.equal(extractGist("", {}), "");
});

test("gist: a two-item list is taken as text", () => {
  assert.equal(extractGist("- step one\n- step two\n", {}), "- step one - step two");
});

test("gist: text inside a code block does not become the gist", () => {
  const body = ["```python", "x = 1", "", "y = 2", "```", "", "A real paragraph."].join("\n");
  assert.equal(extractGist(body, {}), "A real paragraph.");
});

test("anchor: the longest own section", () => {
  const body = ["## Short", "few", "", "## Long", "a".repeat(500)].join("\n");
  const a = extractAnchor(body);
  assert.equal(a.heading, "Long");
  assert.equal(a.chars, 500);
  assert.equal(a.line, 4);
});

test("anchor: a nested ### does not hand its text to the parent", () => {
  const body = ["## Parent", "", "### Child", "b".repeat(300)].join("\n");
  const a = extractAnchor(body);
  assert.equal(a.heading, "Child");
  assert.equal(a.chars, 300);
});

test("anchor: no ## or ### sections — null", () => {
  assert.equal(extractAnchor("# Only a heading\n\ntext\n"), null);
});

test("anchor: a heading inside a code block does not count as a section", () => {
  const body = ["```md", "## Not a section", "```", "", "## Section", "text"].join("\n");
  const a = extractAnchor(body);
  assert.equal(a.heading, "Section");
});

test("links: only existing ones, broken ones are dropped", () => {
  const known = new Set(["docs/a.md", "docs/sub/b.md"]);
  const body = "[a](a.md) [b](sub/b.md) [missing](no-such-doc.md) [ext](https://x.example/y.md)";
  assert.deepEqual(extractLinks(body, "docs/x.md", known), ["docs/a.md", "docs/sub/b.md"]);
});

test("links: an upward path is normalized", () => {
  const known = new Set(["docs/a.md"]);
  assert.deepEqual(extractLinks("[a](../a.md)", "docs/sub/x.md", known), ["docs/a.md"]);
});

test("record: fields from frontmatter, the gist and an anchor with an absolute line", () => {
  const content = [
    "---", "id: REQ-015", "title: Point", "status: draft", "doc-type: br", "service: qc",
    "parent: REQ-012", "---", "", "# REQ-015", "", "## Section", "section text",
  ].join("\n");
  const r = buildRecord({ path: "docs/REQ-015.md", content, knownPaths: new Set(["docs/REQ-015.md"]), mtime: 42 });
  assert.equal(r.id, "REQ-015");
  assert.equal(r.docType, "br");
  assert.equal(r.service, "qc");
  assert.equal(r.gist, "section text");
  assert.equal(r.anchor.heading, "Section");
  assert.equal(r.anchor.line, 12);
  assert.equal(r.bytes, Buffer.byteLength(content, "utf8"));
  assert.equal(r.mtime, 42);
  assert.match(r.hash, /^[0-9a-f]{40}$/);
});

test("record: a document without frontmatter is not lost", () => {
  const content = "# Without metadata\n\nDocument text.\n";
  const r = buildRecord({ path: "docs/x.md", content, knownPaths: new Set(), mtime: 1 });
  assert.equal(r.id, "");
  assert.equal(r.title, "");
  assert.equal(r.gist, "Document text.");
});

test("resolver: an unambiguous reference is resolved", () => {
  const records = [
    { path: "docs/a.md", id: "REQ-001" },
    { path: "docs/b.md", id: "REQ-002", parent: "REQ-001" },
  ];
  const out = resolveRefs(records, ["parent"]);
  assert.equal(out.resolved, 1);
  assert.equal(out.refs["docs/b.md"][0].resolved, "docs/a.md");
});

test("resolver: an ambiguous reference is not guessed", () => {
  const records = [
    { path: "x/a.md", id: "SPEC-003" },
    { path: "y/b.md", id: "SPEC-003" },
    { path: "docs/c.md", id: "SPEC-009", parent: "SPEC-003" },
  ];
  const out = resolveRefs(records, ["parent"]);
  assert.equal(out.ambiguous, 1);
  assert.equal(out.refs["docs/c.md"][0].resolved, null);
  assert.deepEqual(out.refs["docs/c.md"][0].candidates.sort(), ["x/a.md", "y/b.md"]);
});

test("resolver: free text does not count as a reference", () => {
  const records = [
    { path: "docs/a.md", id: "REQ-001" },
    { path: "docs/b.md", id: "REQ-002", parent: "1-AB-06 (core!66, v2)" },
  ];
  const out = resolveRefs(records, ["parent"]);
  assert.equal(out.resolved, 0);
  assert.equal(out.ambiguous, 0);
  // Tokens: "1-AB-06", "core" — free text; "66" is filtered as noise (a bare number)
  // and "v2" is skipped as too short — neither counts as a reference or free text.
  assert.equal(out.freeText, 2);
  assert.deepEqual(out.refs["docs/b.md"], []);
});

test("resolver: a slug resolves when there is no id", () => {
  const records = [
    { path: "docs/REQ-002-report-engine.md", id: "" },
    { path: "docs/b.md", id: "SPEC-1", parent: "REQ-002-report-engine" },
  ];
  const out = resolveRefs(records, ["parent"]);
  assert.equal(out.resolved, 1);
  assert.equal(out.refs["docs/b.md"][0].resolved, "docs/REQ-002-report-engine.md");
});

test("map: a table with id, title, gist and anchor", () => {
  const md = renderMap("docs/req", [
    { path: "docs/req/REQ-001.md", id: "REQ-001", title: "SKU intake", gist: "Complaints from five channels", anchor: { heading: "1. Problem" } },
  ], []);
  assert.match(md, /^# docs\/req\n/);
  assert.match(md, /\| REQ-001 \| SKU intake \| Complaints from five channels \| §1\. Problem \|/);
  assert.match(md, /1 documents/);
});

test("map: subdirectories are listed as links", () => {
  const md = renderMap("docs", [], [{ dir: "docs/req", count: 3 }]);
  assert.match(md, /- \[docs\/req\]\(req\/INDEX\.md\) — 3 documents/);
});

test("map: a directory with a single document gets no map", () => {
  const records = [
    { path: "docs/req/REQ-001.md", id: "REQ-001", title: "A", gist: "g", anchor: null },
    { path: "docs/only/REQ-002.md", id: "REQ-002", title: "B", gist: "g", anchor: null },
  ];
  const maps = buildMaps(records, 120);
  assert.equal(maps.has("docs/only"), false);
  assert.equal(maps.has("docs/req"), false);
  assert.match(maps.get("docs"), /REQ-002/);
});

test("search: all words must be found", () => {
  const records = [
    { path: "a.md", id: "", title: "Inspection SKU", gist: "list of SKU for inspection", anchor: null },
    { path: "b.md", id: "", title: "Inspection", gist: "main venue", anchor: null },
  ];
  const hits = searchIndex(records, "inspection SKU");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "a.md");
});

test("search: morphology finds a word without its last character", () => {
  const records = [
    { path: "a.md", id: "", title: "Boxed goods", gist: "calculation", anchor: null },
  ];
  // "boxes" is not on the face; its stem "boxe" prefixes the title word "boxed".
  assert.equal(searchIndex(records, "boxes").length, 1);
});

test("search: an id weighs more than a title", () => {
  const records = [
    { path: "a.md", id: "REQ-018", title: "Coincidence", gist: "", anchor: null },
    { path: "b.md", id: "", title: "REQ-018 in the title", gist: "", anchor: null },
  ];
  const hits = searchIndex(records, "REQ-018");
  assert.equal(hits[0].path, "a.md");
});

test("comparison: changed, added and missing", () => {
  const index = [
    { path: "a.md", hash: "h1" },
    { path: "b.md", hash: "h2" },
    { path: "d.md", hash: "h4" },
  ];
  const disk = [
    { path: "a.md", hash: "h1" },
    { path: "b.md", hash: "h-CHANGED" },
    { path: "c.md", hash: "h3" },
  ];
  const out = compareIndex(index, disk);
  assert.deepEqual(out.changed, ["b.md"]);
  assert.deepEqual(out.added, ["c.md"]);
  assert.deepEqual(out.missing, ["d.md"]);
});

test("frontmatter: a block scalar with a chomping indicator", () => {
  const folded = parseFrontmatter(["---", "note: >-", "  line one", "  line two", "---", "body"].join("\n"));
  assert.equal(folded.data.note, "line one line two");
  const literal = parseFrontmatter(["---", "note: |-", "  line one", "  line two", "---", "body"].join("\n"));
  assert.equal(literal.data.note, "line one\nline two");
});

test("frontmatter: the document starts with --- but there is no frontmatter", () => {
  const text = "---\nMore text.\n";
  const r = parseFrontmatter(text);
  assert.deepEqual(r.data, {});
  assert.equal(r.body, text);
});

test("record: an excluded document stays without a body", () => {
  const content = ["---", "id: REQ-1", "---", "", "## Section", "secret brief text"].join("\n");
  const r = buildRecord({ path: "docs/reqief.md", content, knownPaths: new Set(), mtime: 1, excluded: true });
  assert.equal(r.id, "REQ-1");
  assert.equal(r.gist, "");
  assert.equal(r.anchor, null);
  assert.deepEqual(r.links, []);
});

test("config: roots and include decide what gets into the index", () => {
  const paths = ["docs/a.md", "wiki/b.md", "other/c.md", "docs/deep/d.md"];
  assert.deepEqual(selectPaths(paths, { roots: ["docs"], include: [] }), ["docs/a.md", "docs/deep/d.md"]);
  assert.deepEqual(selectPaths(paths, { roots: [], include: ["*.md"] }), paths);
  assert.deepEqual(selectPaths(paths, { roots: [], include: ["**/deep/**"] }), ["docs/deep/d.md"]);
});

test("config: exclude marks a path as not body-indexable", () => {
  assert.equal(isExcluded("docs/context/source-briefs/a.md", { exclude: ["**/source-briefs/**"] }), true);
  assert.equal(isExcluded("docs/context/br/a.md", { exclude: ["**/source-briefs/**"] }), false);
  assert.equal(isExcluded("docs/a.md", { exclude: [] }), false);
});

test("map: the row carries the file path", () => {
  const md = renderMap("docs/req", [
    { path: "docs/req/REQ-001.md", id: "REQ-001", title: "SKU intake", gist: "Complaints", anchor: null },
  ], []);
  assert.match(md, /\| docs\/req\/REQ-001\.md \|/);
  assert.match(md, /\| ID \| Title \| Gist \| Anchor \| File \|/);
});

test("map: a single subdirectory is visible in the subdirectory list", () => {
  const records = [
    { path: "docs/req/REQ-001.md", id: "REQ-001", title: "A", gist: "g", anchor: null },
    { path: "docs/only/REQ-002.md", id: "REQ-002", title: "B", gist: "g", anchor: null },
  ];
  const maps = buildMaps(records, 120);
  assert.match(maps.get("docs"), /docs\/only/);
});

test("map: a subdirectory link is relative to its own map", () => {
  const md = renderMap("architecture", [], [{ dir: "architecture/adr", count: 3 }]);
  assert.match(md, /- \[architecture\/adr\]\(adr\/INDEX\.md\) — 3 documents/);
});

test("sections: a heading opens a section, the line is absolute", () => {
  const body = ["## One", "text one", "", "## Two", "text two"].join("\n");
  const sections = extractSections(body, 10);
  assert.deepEqual(
    sections.map((s) => s.heading),
    ["One", "Two"],
  );
  assert.equal(sections[0].line, 10);
  assert.equal(sections[1].line, 13);
  assert.equal(sections[0].text, "text one");
});

test("sections: the prelude before the first heading is a section without a heading", () => {
  const sections = extractSections("intro paragraph\n\n## Section\ntext", 1);
  assert.equal(sections[0].heading, "");
  assert.equal(sections[0].text, "intro paragraph");
  assert.equal(sections[1].heading, "Section");
});

test("sections: a heading inside code does not open a section", () => {
  const body = ["```md", "## Not a section", "```", "", "## Section", "text"].join("\n");
  const sections = extractSections(body, 1);
  assert.deepEqual(
    sections.map((s) => s.heading),
    ["", "Section"],
  );
  assert.match(sections[0].text, /Not a section/);
});

test("sections: a nested heading starts its own section", () => {
  const body = ["## Parent", "intro", "", "### Child", "detail"].join("\n");
  const sections = extractSections(body, 1);
  assert.deepEqual(
    sections.map((s) => s.heading),
    ["Parent", "Child"],
  );
  assert.equal(sections[0].text, "intro");
  assert.equal(sections[1].text, "detail");
});

test("terms: word frequencies, single characters are dropped", () => {
  const terms = sectionTerms("Point inspection on points inspection and a I");
  assert.equal(terms["point"], 1);
  assert.equal(terms["inspection"], 2);
  assert.equal(terms["points"], 1);
  assert.equal(terms["a"], undefined);
});

test("terms: a hyphenated identifier is one word", () => {
  const terms = sectionTerms("see REQ-018 and REQ-018 again");
  assert.equal(terms["req-018"], 2);
});

test("document sections: terms include the heading's words", () => {
  const content = ["# Document", "", "## Inspection", "list of SKU"].join("\n");
  const entry = buildSections("docs/REQ-015.md", content);
  const terms = entry.sections[0].terms;
  assert.equal(terms["inspection"], 1);
  assert.equal(terms["sku"], 1);
  assert.equal(entry.sections[0].line, 3);
});

test("document sections: no indexable sections — null", () => {
  assert.equal(buildSections("docs/x.md", "# Only a heading\n"), null);
  assert.equal(buildSections("docs/x.md", ""), null);
});

test("document sections: a long section is cut at a word boundary", () => {
  const words = Array.from({ length: 4000 }, (_, i) => `word${i}`).join(" ");
  const entry = buildSections("docs/long.md", ["## Long", words].join("\n"));
  const terms = entry.sections[0].terms;
  assert.ok(Object.keys(terms).length < 800);
  assert.ok(terms["word0"]);
  assert.equal(terms["word3999"], undefined);
  // Truncation does not leave a word stump
  assert.ok(Object.keys(terms).every((term) => term === "long" || /^word\d+$/.test(term)));
});

const FACE_RECORDS = [
  { path: "a.md", id: "REQ-001", title: "Inspection", gist: "point of the inspection", anchor: null },
  { path: "b.md", id: "REQ-002", title: "Warehouse", gist: "goods intake", anchor: null },
];

const BODY_STATS = {
  schema: 1,
  docs: [
    {
      path: "a.md",
      sections: [{ h: "Warehouse", line: 5, terms: { warehouse: 2, pallet: 3, goods: 1 } }],
    },
    {
      path: "b.md",
      sections: [{ h: "Intake", line: 3, terms: { warehouse: 1, pallet: 1, goods: 2 } }],
    },
  ],
};

test("body search: the face does not lose its position", () => {
  const { face, body } = searchWithBody(FACE_RECORDS, BODY_STATS, "inspection");
  assert.equal(face.length, 1);
  assert.equal(face[0].path, "a.md");
  assert.equal(body.length, 0);
});

test("body search: a document without a face is found by its section, with that section's anchor", () => {
  const records = [{ path: "b.md", id: "REQ-002", title: "Warehouse", gist: "intake", anchor: null }];
  const stats = {
    schema: 1,
    docs: [
      { path: "b.md", sections: [{ h: "Pallets", line: 7, terms: { pallet: 4, warehouse: 1 } }] },
    ],
  };
  const { face, body } = searchWithBody(records, stats, "pallet");
  assert.equal(face.length, 0);
  assert.equal(body.length, 1);
  assert.equal(body[0].path, "b.md");
  assert.equal(body[0].anchor.heading, "Pallets");
  assert.equal(body[0].anchor.line, 7);
});

test("body search: all words must be found", () => {
  const records = [{ path: "b.md", id: "", title: "", gist: "", anchor: null }];
  const stats = {
    schema: 1,
    docs: [{ path: "b.md", sections: [{ h: "S", line: 1, terms: { pallet: 3 } }] }],
  };
  assert.equal(searchWithBody(records, stats, "pallet warehouse").body.length, 0);
  assert.equal(searchWithBody(records, stats, "pallet").body.length, 1);
});

test("body search: section morphology finds a word without its last character", () => {
  const records = [{ path: "b.md", id: "", title: "", gist: "", anchor: null }];
  const stats = {
    schema: 1,
    docs: [{ path: "b.md", sections: [{ h: "S", line: 1, terms: { boxed: 3 } }] }],
  };
  // "boxes" is absent from the terms; its stem "boxe" prefixes the section word "boxed".
  assert.equal(searchWithBody(records, stats, "boxes").body.length, 1);
});

test("body search: a word on the face replaces a missing section", () => {
  // The warehouse term appears in a section, the intake term only on the face:
  // the document passes through the face, the anchor comes from the best section.
  const records = [{ path: "b.md", id: "", title: "Intake", gist: "", anchor: null }];
  const stats = {
    schema: 1,
    docs: [{ path: "b.md", sections: [{ h: "S", line: 1, terms: { warehouse: 3 } }] }],
  };
  const { body } = searchWithBody(records, stats, "warehouse intake");
  assert.equal(body.length, 1);
});

test("body search: no stats — face only", () => {
  const { face, body } = searchWithBody(FACE_RECORDS, null, "inspection");
  assert.equal(face.length, 1);
  assert.equal(body.length, 0);
});

test("body search: an excluded document does not take part in the body", () => {
  const records = [
    { path: "brief.md", id: "", title: "Brief", gist: "", anchor: null },
    { path: "b.md", id: "", title: "", gist: "", anchor: null },
  ];
  const stats = {
    schema: 1,
    docs: [{ path: "b.md", sections: [{ h: "S", line: 1, terms: { pallet: 2 } }] }],
  };
  const { body } = searchWithBody(records, stats, "pallet");
  assert.equal(body.length, 1);
  assert.equal(body[0].path, "b.md");
});

test("body search: the document with the more frequent term ranks higher", () => {
  const records = [
    { path: "a.md", id: "", title: "", gist: "", anchor: null },
    { path: "b.md", id: "", title: "", gist: "", anchor: null },
  ];
  const stats = {
    schema: 1,
    docs: [
      { path: "a.md", sections: [{ h: "S", line: 1, terms: { inspection: 1, field: 10 } }] },
      { path: "b.md", sections: [{ h: "S", line: 1, terms: { inspection: 5 } }] },
    ],
  };
  const { body } = searchWithBody(records, stats, "inspection");
  assert.equal(body.length, 2);
  assert.equal(body[0].path, "b.md");
});

const GRAPH_RECORDS = [
  { path: "docs/a.md", id: "A", title: "", gist: "", anchor: null, links: ["docs/b.md", "docs/c.md"], refs: [] },
  { path: "docs/b.md", id: "B", title: "", gist: "", anchor: null, links: ["docs/a.md"], refs: [{ key: "parent", value: "A", resolved: "docs/a.md", candidates: [] }] },
  { path: "docs/c.md", id: "C", title: "", gist: "", anchor: null, links: [], refs: [] },
  { path: "docs/d.md", id: "D", title: "", gist: "", anchor: null, links: [], refs: [] },
  { path: "docs/e.md", id: "E", title: "", gist: "", anchor: null, links: ["docs/e.md"], refs: [] },
];

test("graph: relations from links and resolved fields", () => {
  const graph = buildGraph(GRAPH_RECORDS);
  const related = relatedOf("docs/a.md", graph);
  const paths = related.map((n) => n.path);
  assert.deepEqual(paths, ["docs/b.md", "docs/c.md"]);
  const b = related[0];
  assert.equal(b.mutual, true);
  assert.equal(b.relations.length, 3);
  assert.deepEqual(
    b.relations.map((r) => `${r.dir} ${r.key}`),
    ["out link", "in link", "in parent"],
  );
});

test("graph: a self-link is invisible", () => {
  const graph = buildGraph(GRAPH_RECORDS);
  assert.equal(relatedOf("docs/e.md", graph).length, 0);
});

test("graph: an isolated document — empty", () => {
  const graph = buildGraph(GRAPH_RECORDS);
  assert.deepEqual(relatedOf("docs/d.md", graph), []);
});

test("target: an exact path and a path without the extension", () => {
  assert.equal(resolveTarget(GRAPH_RECORDS, "docs/a.md").path, "docs/a.md");
  assert.equal(resolveTarget(GRAPH_RECORDS, "docs/a").path, "docs/a.md");
  assert.equal(resolveTarget(GRAPH_RECORDS, "docs\\a.md").path, "docs/a.md");
});

test("target: a unique id and a unique slug", () => {
  assert.equal(resolveTarget(GRAPH_RECORDS, "B").path, "docs/b.md");
  assert.equal(resolveTarget(GRAPH_RECORDS, "c").path, "docs/c.md");
});

test("target: an ambiguous id is not guessed", () => {
  const records = [
    { path: "x/a.md", id: "SPEC-1", title: "", gist: "", anchor: null },
    { path: "y/b.md", id: "SPEC-1", title: "", gist: "", anchor: null },
  ];
  const out = resolveTarget(records, "SPEC-1");
  assert.equal(out.error, "ambiguous");
  assert.deepEqual(out.candidates, ["x/a.md", "y/b.md"]);
});

test("target: an unknown argument — an error without candidates", () => {
  const out = resolveTarget(GRAPH_RECORDS, "no-such-doc");
  assert.equal(out.error, "unknown");
  assert.deepEqual(out.candidates, []);
});

test("path: a direct relation — one step with a direction", () => {
  const graph = buildGraph(GRAPH_RECORDS);
  const steps = shortestPath("docs/a.md", "docs/c.md", graph);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].from, "docs/a.md");
  assert.equal(steps[0].to, "docs/c.md");
  assert.equal(steps[0].edge.key, "link");
});

test("path: two steps through a neighbor", () => {
  const graph = buildGraph(GRAPH_RECORDS);
  const steps = shortestPath("docs/c.md", "docs/b.md", graph);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].from, "docs/c.md");
  assert.equal(steps[0].to, "docs/a.md");
  assert.equal(steps[1].to, "docs/b.md");
});

test("path: the same vertex and a missing chain", () => {
  const graph = buildGraph(GRAPH_RECORDS);
  assert.deepEqual(shortestPath("docs/a.md", "docs/a.md", graph), []);
  assert.equal(shortestPath("docs/a.md", "docs/d.md", graph), null);
  assert.equal(shortestPath("docs/a.md", "missing", graph), null);
});

test("brokenLinks: corpus-external link targets are reported, internal ones are not", () => {
  const known = new Set(["docs/req/REQ-001.md", "docs/br/BR-001.md"]);
  const body = [
    "internal: [req](REQ-001.md)",
    "external: [br](../br/BR-001.md)",
    "broken: [spec](../specs/2026-01-01-topic.md)",
    "anchor and url do not count: [x](REQ-001.md#anchor) [y](https://example.com)",
  ].join("\n");
  assert.deepEqual(brokenLinks(body, "docs/req/REQ-002.md", known), ["docs/specs/2026-01-01-topic.md"]);
  assert.deepEqual(extractLinks(body, "docs/req/REQ-002.md", known), [
    "docs/br/BR-001.md",
    "docs/req/REQ-001.md",
  ]);
  assert.deepEqual(brokenLinks("", "docs/a.md", known), []);
});
