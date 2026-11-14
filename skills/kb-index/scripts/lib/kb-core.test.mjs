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
    ["---", "id: SPEC-001", 'title: " "', "status: draft", "---", "", ""].join("\n"),
  );
  assert.equal(r.data.id, "SPEC-001");
  assert.equal(r.data.title, " ");
  assert.equal(r.data.status, "draft");
  assert.equal(r.body, "\n");
  assert.equal(r.bodyStartLine, 6);
});

test("frontmatter: inline list and block list", () => {
  const r = parseFrontmatter(
    ["---", "children: [SPEC-002, SPEC-003]", "br:", "  - REQ-001", "  - REQ-002", "---", ""].join("\n"),
  );
  assert.deepEqual(r.data.children, ["SPEC-002", "SPEC-003"]);
  assert.deepEqual(r.data.br, ["REQ-001", "REQ-002"]);
});

test("frontmatter: nested map and block scalar", () => {
  const r = parseFrontmatter(
    ["---", "coverage:", "  code: full", "  tests: none", "note: |", "   ", "   ", "---", ""].join("\n"),
  );
  assert.deepEqual(r.data.coverage, { code: "full", tests: "none" });
  assert.equal(r.data.note, " \n ");
});

test("frontmatter: without frontmatter the body stays intact", () => {
  const r = parseFrontmatter("#  \n");
  assert.deepEqual(r.data, {});
  assert.equal(r.body, "#  \n");
  assert.equal(r.bodyStartLine, 1);
});

test("frontmatter: an unclosed block — the body stays intact", () => {
  const r = parseFrontmatter("---\nid: X\n \n");
  assert.deepEqual(r.data, {});
  assert.equal(r.body, "---\nid: X\n \n");
});

test("gist: description takes priority over the body", () => {
  assert.equal(extractGist("", { description: " " }), " ");
  assert.equal(extractGist("", { summary: " summary" }), " summary");
});

test("gist: a quote, a table and a table of contents are skipped", () => {
  const body = [
    ">   ",
    "",
    "| a | b |",
    "",
    "-  ",
    "-  ",
    "-  ",
    "",
    "  .",
  ].join("\n");
  assert.equal(extractGist(body, {}), "  .");
});

test("gist: no prose — empty", () => {
  assert.equal(extractGist(">  \n\n| a |\n", {}), "");
  assert.equal(extractGist("", {}), "");
});

test("gist: a two-item list is taken as text", () => {
  assert.equal(extractGist("-  \n-  \n", {}), "-   -  ");
});

test("gist: text inside a code block does not become the gist", () => {
  const body = ["```python", "x = 1", "", "y = 2", "```", "", " ."].join("\n");
  assert.equal(extractGist(body, {}), " .");
});

test("anchor: the longest own section", () => {
  const body = ["## ", "", "", "## ", "".repeat(500)].join("\n");
  const a = extractAnchor(body);
  assert.equal(a.heading, "");
  assert.equal(a.chars, 500);
  assert.equal(a.line, 4);
});

test("anchor: a nested ### does not hand its text to the parent", () => {
  const body = ["## ", "", "### ", "".repeat(300)].join("\n");
  const a = extractAnchor(body);
  assert.equal(a.heading, "");
  assert.equal(a.chars, 300);
});

test("anchor: no ## or ### sections — null", () => {
  assert.equal(extractAnchor("#  \n\n\n"), null);
});

test("anchor: a heading inside a code block does not count as a section", () => {
  const body = ["```md", "##  ", "```", "", "## ", ""].join("\n");
  const a = extractAnchor(body);
  assert.equal(a.heading, "");
});

test("links: only existing ones, broken ones are dropped", () => {
  const known = new Set(["docs/a.md", "docs/sub/b.md"]);
  const body = "[a](a.md) [b](sub/b.md) [](-.md) [](https://x.example/y.md)";
  assert.deepEqual(extractLinks(body, "docs/x.md", known), ["docs/a.md", "docs/sub/b.md"]);
});

test("links: an upward path is normalized", () => {
  const known = new Set(["docs/a.md"]);
  assert.deepEqual(extractLinks("[a](../a.md)", "docs/sub/x.md", known), ["docs/a.md"]);
});

test("record: fields from frontmatter, the gist and an anchor with an absolute line", () => {
  const content = [
    "---", "id: REQ-015", "title: ", "status: draft", "doc-type: br", "service: qc",
    "parent: REQ-012", "---", "", "# REQ-015", "", "## ", " ",
  ].join("\n");
  const r = buildRecord({ path: "docs/REQ-015.md", content, knownPaths: new Set(["docs/REQ-015.md"]), mtime: 42 });
  assert.equal(r.id, "REQ-015");
  assert.equal(r.docType, "br");
  assert.equal(r.service, "qc");
  assert.equal(r.gist, " ");
  assert.equal(r.anchor.heading, "");
  assert.equal(r.anchor.line, 12);
  assert.equal(r.bytes, Buffer.byteLength(content, "utf8"));
  assert.equal(r.mtime, 42);
  assert.match(r.hash, /^[0-9a-f]{40}$/);
});

test("record: a document without frontmatter is not lost", () => {
  const content = "#  \n\n .\n";
  const r = buildRecord({ path: "docs/x.md", content, knownPaths: new Set(), mtime: 1 });
  assert.equal(r.id, "");
  assert.equal(r.title, "");
  assert.equal(r.gist, " .");
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
    { path: "docs/b.md", id: "REQ-002", parent: "1-AB-06 (core!66, )" },
  ];
  const out = resolveRefs(records, ["parent"]);
  assert.equal(out.resolved, 0);
  assert.equal(out.ambiguous, 0);
  assert.equal(out.freeText, 3);
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
    { path: "docs/req/REQ-001.md", id: "REQ-001", title: " SKU", gist: "   ", anchor: { heading: "1. " } },
  ], []);
  assert.match(md, /^# docs\/req\n/);
  assert.match(md, /\| REQ-001 \|  SKU \|     \| §1\.  \|/);
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
  const maps = buildMaps(records, new Set());
  assert.equal(maps.has("docs/only"), false);
  assert.equal(maps.has("docs/req"), false);
  assert.match(maps.get("docs"), /REQ-002/);
});

test("search: all words must be found", () => {
  const records = [
    { path: "a.md", id: "", title: " SKU", gist: " SKU  ", anchor: null },
    { path: "b.md", id: "", title: "", gist: " ", anchor: null },
  ];
  const hits = searchIndex(records, " SKU");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "a.md");
});

test("search: morphology finds a word without its last character", () => {
  const records = [
    { path: "a.md", id: "", title: " ", gist: "", anchor: null },
  ];
  assert.equal(searchIndex(records, "").length, 1);
});

test("search: an id weighs more than a title", () => {
  const records = [
    { path: "a.md", id: "REQ-018", title: "", gist: "", anchor: null },
    { path: "b.md", id: "", title: "REQ-018  ", gist: "", anchor: null },
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
  const folded = parseFrontmatter(["---", "note: >-", "   ", "   ", "---", ""].join("\n"));
  assert.equal(folded.data.note, "   ");
  const literal = parseFrontmatter(["---", "note: |-", "   ", "   ", "---", ""].join("\n"));
  assert.equal(literal.data.note, " \n ");
});

test("frontmatter: the document starts with --- but there is no frontmatter", () => {
  const text = "---\n .\n";
  const r = parseFrontmatter(text);
  assert.deepEqual(r.data, {});
  assert.equal(r.body, text);
});

test("record: an excluded document stays without a body", () => {
  const content = ["---", "id: REQ-1", "---", "", "## ", "  "].join("\n");
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
    { path: "docs/req/REQ-001.md", id: "REQ-001", title: " SKU", gist: "", anchor: null },
  ], []);
  assert.match(md, /\| docs\/req\/REQ-001\.md \|/);
  assert.match(md, /\| ID \| Title \| Gist \| Anchor \| File \|/);
});

test("map: a single subdirectory is visible in the subdirectory list", () => {
  const records = [
    { path: "docs/req/REQ-001.md", id: "REQ-001", title: "A", gist: "g", anchor: null },
    { path: "docs/only/REQ-002.md", id: "REQ-002", title: "B", gist: "g", anchor: null },
  ];
  const maps = buildMaps(records, new Set());
  assert.match(maps.get("docs"), /docs\/only/);
});

test("map: a subdirectory link is relative to its own map", () => {
  const md = renderMap("architecture", [], [{ dir: "architecture/adr", count: 3 }]);
  assert.match(md, /- \[architecture\/adr\]\(adr\/INDEX\.md\) — 3 documents/);
});

test("sections: a heading opens a section, the line is absolute", () => {
  const body = ["## ", " ", "", "## ", " "].join("\n");
  const sections = extractSections(body, 10);
  assert.deepEqual(
    sections.map((s) => s.heading),
    ["", ""],
  );
  assert.equal(sections[0].line, 10);
  assert.equal(sections[1].line, 13);
  assert.equal(sections[0].text, " ");
});

test("sections: the prelude before the first heading is a section without a heading", () => {
  const sections = extractSections(" \n\n## \n", 1);
  assert.equal(sections[0].heading, "");
  assert.equal(sections[0].text, " ");
  assert.equal(sections[1].heading, "");
});

test("sections: a heading inside code does not open a section", () => {
  const body = ["```md", "##  ", "```", "", "## ", ""].join("\n");
  const sections = extractSections(body, 1);
  assert.deepEqual(
    sections.map((s) => s.heading),
    ["", ""],
  );
  assert.match(sections[0].text, / /);
});

test("sections: a nested heading starts its own section", () => {
  const body = ["## ", "", "", "### ", ""].join("\n");
  const sections = extractSections(body, 1);
  assert.deepEqual(
    sections.map((s) => s.heading),
    ["", ""],
  );
  assert.equal(sections[0].text, "");
  assert.equal(sections[1].text, "");
});

test("terms: word frequencies, single characters are dropped", () => {
  const terms = sectionTerms("       ");
  assert.equal(terms[""], 1);
  assert.equal(terms[""], 2);
  assert.equal(terms[""], 1);
  assert.equal(terms[""], undefined);
});

test("terms: a hyphenated identifier is one word", () => {
  const terms = sectionTerms(". REQ-018  REQ-018 ");
  assert.equal(terms["req-018"], 2);
});

test("document sections: terms include the heading's words", () => {
  const content = ["# ", "", "## ", " SKU"].join("\n");
  const entry = buildSections("docs/REQ-015.md", content);
  const terms = entry.sections[0].terms;
  assert.equal(terms[""], 1);
  assert.equal(terms["sku"], 1);
  assert.equal(entry.sections[0].line, 3);
});

test("document sections: no indexable sections — null", () => {
  assert.equal(buildSections("docs/x.md", "#  \n"), null);
  assert.equal(buildSections("docs/x.md", ""), null);
});

test("document sections: a long section is cut at a word boundary", () => {
  const words = Array.from({ length: 4000 }, (_, i) => `${i}`).join(" ");
  const entry = buildSections("docs/long.md", ["## ", words].join("\n"));
  const terms = entry.sections[0].terms;
  assert.ok(Object.keys(terms).length < 800);
  assert.ok(terms["0"]);
  assert.equal(terms["3999"], undefined);
  // Truncation does not leave a word stump
  assert.ok(Object.keys(terms).every((term) => term === "" || /^\d+$/.test(term)));
});

const FACE_RECORDS = [
  { path: "a.md", id: "REQ-001", title: "", gist: "  ", anchor: null },
  { path: "b.md", id: "REQ-002", title: "", gist: " ", anchor: null },
];

const BODY_STATS = {
  schema: 1,
  docs: [
    {
      path: "a.md",
      sections: [{ h: "", line: 5, terms: { : 2, : 3, : 1 } }],
    },
    {
      path: "b.md",
      sections: [{ h: "", line: 3, terms: { : 1, : 1, : 2 } }],
    },
  ],
};

test("body search: the face does not lose its position", () => {
  const { face, body } = searchWithBody(FACE_RECORDS, BODY_STATS, "");
  assert.equal(face.length, 1);
  assert.equal(face[0].path, "a.md");
  assert.equal(body.length, 0);
});

test("body search: a document without a face is found by its section, with that section's anchor", () => {
  const records = [{ path: "b.md", id: "REQ-002", title: "", gist: "", anchor: null }];
  const stats = {
    schema: 1,
    docs: [
      { path: "b.md", sections: [{ h: "", line: 7, terms: { : 4, : 1 } }] },
    ],
  };
  const { face, body } = searchWithBody(records, stats, "");
  assert.equal(face.length, 0);
  assert.equal(body.length, 1);
  assert.equal(body[0].path, "b.md");
  assert.equal(body[0].anchor.heading, "");
  assert.equal(body[0].anchor.line, 7);
});

test("body search: all words must be found", () => {
  const records = [{ path: "b.md", id: "", title: "", gist: "", anchor: null }];
  const stats = {
    schema: 1,
    docs: [{ path: "b.md", sections: [{ h: "S", line: 1, terms: { : 3 } }] }],
  };
  assert.equal(searchWithBody(records, stats, " ").body.length, 0);
  assert.equal(searchWithBody(records, stats, "").body.length, 1);
});

test("body search: section morphology finds a word without its last character", () => {
  const records = [{ path: "b.md", id: "", title: "", gist: "", anchor: null }];
  const stats = {
    schema: 1,
    docs: [{ path: "b.md", sections: [{ h: "S", line: 1, terms: { : 3 } }] }],
  };
  assert.equal(searchWithBody(records, stats, "").body.length, 1);
});

test("body search: a word on the face replaces a missing section", () => {
  // The warehouse term appears on the face and in a section, the intake term only on the face:
  // the document passes through the face, the anchor comes from the best section.
  const records = [{ path: "b.md", id: "", title: "", gist: "", anchor: null }];
  const stats = {
    schema: 1,
    docs: [{ path: "b.md", sections: [{ h: "S", line: 1, terms: { : 3 } }] }],
  };
  const { body } = searchWithBody(records, stats, " ");
  assert.equal(body.length, 1);
});

test("body search: no stats — face only", () => {
  const { face, body } = searchWithBody(FACE_RECORDS, null, "");
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
    docs: [{ path: "b.md", sections: [{ h: "S", line: 1, terms: { : 2 } }] }],
  };
  const { body } = searchWithBody(records, stats, "");
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
      { path: "a.md", sections: [{ h: "S", line: 1, terms: { : 1, : 10 } }] },
      { path: "b.md", sections: [{ h: "S", line: 1, terms: { : 5 } }] },
    ],
  };
  const { body } = searchWithBody(records, stats, "");
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
  const out = resolveTarget(GRAPH_RECORDS, "-");
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
  assert.equal(shortestPath("docs/a.md", "", graph), null);
});
