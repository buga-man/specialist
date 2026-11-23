import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { budgetFindings, linkFindings, localLinks, skillFiles, stripFences } from "./skill-size.mjs";

test("budgetFindings: a document inside both caps is clean", () => {
  const text = "---\nname: x\n---\n# X\n" + "line\n".repeat(100);
  assert.deepEqual(budgetFindings(text), []);
});

test("budgetFindings: over the line cap is a finding naming the count", () => {
  const text = "line\n".repeat(221);
  const findings = budgetFindings(text);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^222 lines \(budget 220\)/);
});

test("budgetFindings: within the line cap but over the byte cap is a finding — UTF-8 bytes, not characters", () => {
  // 5 lines of 4000-byte Cyrillic: 5 < 220 lines, ~20 KB > 13 KB bytes
  const text = "ы".repeat(2000) + "\n" + "ы".repeat(2000) + "\n" + "ы".repeat(2000) + "\n" + "ы".repeat(2000) + "\n" + "ы".repeat(2000) + "\n";
  const findings = budgetFindings(text);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^20005 UTF-8 bytes \(budget 13312\)/);
});

test("budgetFindings: CRLF counts as LF — an autocrlf working copy pays no byte per line", () => {
  const text = ("ы".repeat(2000) + "\r\n").repeat(5);
  const lfText = ("ы".repeat(2000) + "\n").repeat(5);
  assert.deepEqual(budgetFindings(text), budgetFindings(lfText));
});

test("stripFences: links inside a fenced block are cut, links outside stay", () => {
  const text = [
    "see [living](references/a.md)",
    "```",
    "![<what it shows>](docs/manual/assets/<name>.png)",
    "~~~",
    "[tilded](gone.md) inside",
    "~~~",
    "after",
  ].join("\n");
  const stripped = stripFences(text);
  assert.deepEqual(localLinks(stripped), ["references/a.md"]);
});

test("localLinks: anchors are dropped, scheme links skipped, bare parentheses ignored", () => {
  const text = "[a](ref/b.md#section) [c](https://example.com/x) [d](mailto:x@y.z) not (a/link.md) [e](./c.md)";
  assert.deepEqual(localLinks(text), ["ref/b.md", "./c.md"]);
});

const tmp = mkdtempSync(join(tmpdir(), "skill-size-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));

test("linkFindings: a target on disk resolves, a dead target is a finding", () => {
  const dir = join(tmp, "links");
  mkdirSync(join(dir, "references"), { recursive: true });
  writeFileSync(join(dir, "references", "a.md"), "x");
  writeFileSync(join(dir, "SKILL.md"), "[ok](references/a.md) [dead](references/b.md)");
  const findings = linkFindings(join(dir, "SKILL.md"));
  assert.equal(findings.length, 1);
  assert.match(findings[0], /"references\/b\.md" does not exist/);
});

test("skillFiles: the plugin tree and the mirrored role trees are both collected", () => {
  mkdirSync(join(tmp, "skills", "alpha"), { recursive: true });
  writeFileSync(join(tmp, "skills", "alpha", "SKILL.md"), "a");
  mkdirSync(join(tmp, "skills", "beta")); // a skill directory without SKILL.md — not ours
  mkdirSync(join(tmp, "roles", "qa", "skills", "gamma"), { recursive: true });
  writeFileSync(join(tmp, "roles", "qa", "skills", "gamma", "SKILL.md"), "g");
  mkdirSync(join(tmp, "roles", "dev", "hooks"), { recursive: true }); // a role subtree without skills — skipped
  assert.deepEqual(skillFiles(tmp), [
    "roles/qa/skills/gamma/SKILL.md",
    "skills/alpha/SKILL.md",
  ]);
});
