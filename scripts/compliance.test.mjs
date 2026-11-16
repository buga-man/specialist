/**
 * Tests for compliance.mjs — the strict frontmatter parser, the skill validator and
 * the catalog builder. The full-repo audit itself runs via `npm run compliance`.
 * Run: node --test scripts/compliance.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalog, parseFrontmatterStrict, validateSkill } from "./compliance.mjs";

const fm = (body) => `---\n${body}\n---\n\n# Title\n`;

test("strict frontmatter: plain and quoted scalars parse, quoting is stripped", () => {
  const ok = parseFrontmatterStrict(fm('name: alpha\ndescription: "Do things: fast"\n'));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.data.name, "alpha");
  assert.equal(ok.data.description, "Do things: fast");
});

test("strict frontmatter: a colon-space inside a plain scalar is the rejected bug class", () => {
  const bad = parseFrontmatterStrict(fm("description: Use it: everywhere\n"));
  assert.equal(bad.data.description, "Use it: everywhere"); // the data is still extracted
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /": "/);
  assert.match(bad.errors[0], /quote the value or rephrase/);
});

test("strict frontmatter: a URL with a bare colon is fine — only colon-space is a mapping", () => {
  const ok = parseFrontmatterStrict(fm("description: See https://example.com for more\n"));
  assert.deepEqual(ok.errors, []);
});

test("strict frontmatter: an unquoted ' #' is flagged — a strict parser reads it as a comment", () => {
  const bad = parseFrontmatterStrict(fm("description: first # second\n"));
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /comment/);
  // The lenient extraction keeps the whole line — the error is what carries the signal.
  assert.equal(bad.data.description, "first # second");
});

test("strict frontmatter: duplicate keys, tabs and non-pair lines are named", () => {
  const bad = parseFrontmatterStrict(fm("name: a\nname: b\ndescription: x\n\twrong: y\njust text\n"));
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0], /duplicate/);
  assert.match(bad.errors[1], /tab/);
  assert.match(bad.errors[2], /not a "key: value" pair/);
});

test("strict frontmatter: escapes unescape to what a real YAML parser reads", () => {
  // The kb-index bug class: \" inside a double-quoted scalar used to land in the
  // generated catalog as a literal backslash-quote instead of what hosts autoload.
  const dq = parseFrontmatterStrict(fm('description: "say \\"hi\\" and C:\\\\temp"\n'));
  assert.deepEqual(dq.errors, []);
  assert.equal(dq.data.description, 'say "hi" and C:\\temp');
  const sq = parseFrontmatterStrict(fm("description: 'it''s fine'\n"));
  assert.deepEqual(sq.errors, []);
  assert.equal(sq.data.description, "it's fine");
});

test("strict frontmatter: a comment-only line is allowed, unclosed block is an error", () => {
  const ok = parseFrontmatterStrict(fm("# a comment\nname: a\ndescription: b\n"));
  assert.deepEqual(ok.errors, []);
  const unclosed = parseFrontmatterStrict("name: a\n");
  assert.equal(unclosed.errors.length, 1);
  assert.match(unclosed.errors[0], /---/);
});

const GOOD = (name, description) =>
  fm(`name: ${name}\ndescription: ${JSON.stringify(description)}\n`);

test("validateSkill: a clean skill passes", () => {
  assert.deepEqual(validateSkill("alpha", GOOD("alpha", "Do the thing.")), []);
});

test("validateSkill: name and description limits from the template are enforced", () => {
  const findings = validateSkill("beta", GOOD("alpha", "x"));
  assert.ok(findings.some((f) => f.includes('name "alpha" != directory name')));
  const long = validateSkill("beta", GOOD("beta", "x".repeat(1025)));
  assert.ok(long.some((f) => f.includes("1025 chars")));
  assert.ok(long.some((f) => f.includes("limit is 1024")));
});

test("validateSkill: portability — host variables, absolute paths, template leftovers", () => {
  const body = fm("name: beta\ndescription: x\n") +
    'Run node "${CLAUDE_PLUGIN_ROOT}/x.mjs"\nsee C:\\tools and /Users/ivan and /home/ivan\n';
  const findings = validateSkill("beta", body);
  assert.ok(findings.some((f) => f.includes("host variables")));
  assert.ok(findings.some((f) => f.includes("Windows absolute path")));
  assert.ok(findings.some((f) => f.includes("/Users/")));
  assert.ok(findings.some((f) => f.includes("/home/")));
  const leftover = validateSkill("beta", GOOD("beta", "x") + "<!-- Checklist for adding a new skill -->\n");
  assert.ok(leftover.some((f) => f.includes("checklist")));
});

test("validateSkill: a frontmatter parse error surfaces with the skill's name", () => {
  const findings = validateSkill("beta", fm("description: bad: here\n"));
  assert.ok(findings.some((f) => f.startsWith("beta:") && f.includes('": "')));
});

test("buildCatalog: alphabetical rows, links, pipes escaped", () => {
  const md = buildCatalog([
    { name: "zeta", description: "Last | one" },
    { name: "alpha", description: "First one" },
  ]);
  const rows = md.split("\n").filter((l) => l.startsWith("| ["));
  assert.equal(rows.length, 2);
  assert.match(rows[0], /\[alpha\]\(\.\.\/skills\/alpha\/SKILL\.md\) \| First one/);
  assert.match(rows[1], /Last \\[|] one/);
});
