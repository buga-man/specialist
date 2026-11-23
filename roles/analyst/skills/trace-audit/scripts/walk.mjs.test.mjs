/**
 * Tests for skills/trace-audit/scripts/walk.mjs — the artifact-tree walk.
 * Run: node --test skills/trace-audit/scripts/walk.mjs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditArtifacts, openQuestionNumbers, parseFrontmatter } from "./walk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WALK = join(HERE, "walk.mjs");
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const BUSINESS = [
  "---",
  "id: payments",
  "children: [payments-api]",
  "status: approved",
  "---",
  "# Payments — business specification",
  "",
  "## 3. Acceptance criteria",
  "1. When a user pays, the system shall record the payment. (must) — Verify: command — pay.sh → exit 0",
  "2. When the card is declined, the system shall show the retry dialog. (must) — Verify: stand — the dialog shows",
  "",
  "## 7. Open questions",
  "| # | Question | Working assumption | Risk | Blocking |",
  "|---|---|---|---|---|",
  "| 1 | Which PSP? | The current one | Medium | no |",
].join("\n");

const REPO_SPEC = [
  "---",
  "id: payments-api",
  "parent: payments",
  "status: approved",
  "---",
  "# Payments API — repo spec",
].join("\n");

const happy = () => ({
  specs: [
    { name: "2026-11-01-payments.md", text: BUSINESS },
    { name: "2026-11-01-payments-api.md", text: REPO_SPEC },
  ],
  plans: [
    { name: "2026-11-02-payments-api.md", text: "# Plan\n\n## Task 1\n- pay.sh → exit 0\n- Done: abc123\n" },
  ],
  tests: [
    { name: "2026-11-03-payments-api-cases.md", text: "## Cases\n\n| ID | Criterion | Type | Grader | State / input | Expected |\n|---|---|---|---|---|---|\n| TEST-PAY-001 | 1 | main | command | valid pay | exit 0 |\n" },
  ],
});

test("the linked tree walks clean — no findings", () => {
  const r = auditArtifacts(happy());
  assert.deepEqual(r.findings, []);
  assert.equal(r.artifacts, 4);
});

test("parseFrontmatter: inline and YAML-list children, missing frontmatter", () => {
  assert.deepEqual(parseFrontmatter(BUSINESS).children, ["payments-api"]);
  const list = parseFrontmatter(["---", "id: x", "children:", "  - a", "  - b", "status: draft", "---"].join("\n"));
  assert.deepEqual(list.children, ["a", "b"]);
  assert.deepEqual(parseFrontmatter("# No frontmatter\n").children, undefined);
});

test("openQuestionNumbers: bilingual headings, table rows only; null without a section", () => {
  assert.deepEqual(openQuestionNumbers(BUSINESS), [1]);
  const ru = ["# Спека", "", "## 7. Открытые вопросы", "", "| # | Вопрос |", "|---|---|", "| 2 | Второй? |"].join("\n");
  assert.deepEqual(openQuestionNumbers(ru), [2]);
  assert.equal(openQuestionNumbers("# No questions here\n"), null);
});

test("traceability: one-way parent link, dead child link, missing parent, id/slug mismatch", () => {
  const docs = happy();
  docs.specs[0] = { // the child points up, nothing points back
    name: "2026-11-01-payments.md",
    text: BUSINESS.replace("children: [payments-api]", "children: [ghost]"),
  };
  docs.specs.push({
    name: "2026-11-01-orphan.md",
    text: ["---", "id: orphan", "parent: missing-id", "---", "# Orphan"].join("\n"),
  });
  docs.specs.push({
    name: "2026-11-01-mismatch.md",
    text: ["---", "id: different-slug", "---", "# Mismatch"].join("\n"),
  });
  const r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => /children does not list "payments-api"/.test(f.finding)).length, 1);
  assert.equal(r.findings.filter((f) => /"ghost" resolves to no artifact/.test(f.finding)).length, 1);
  assert.equal(r.findings.filter((f) => /"missing-id" resolves to no artifact/.test(f.finding)).length, 1);
  assert.equal(r.findings.filter((f) => /absent from the file's slug/.test(f.finding)).length, 1);
});

test("status honesty: draft with children, and draft with closed plan tasks", () => {
  const docs = happy();
  docs.specs[0] = { name: "2026-11-01-payments.md", text: BUSINESS.replace("status: approved", "status: draft") };
  const r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => f.check === "status honesty").length, 2);
  assert.equal(r.findings.filter((f) => /1 child artifact/.test(f.finding)).length, 1);
  assert.equal(r.findings.filter((f) => /status draft while .* carries closed tasks/.test(f.finding)).length, 1);
});

test("orphan criteria: a wrapped criterion keeps its (must) marker and Verify tail", () => {
  const docs = happy();
  docs.specs[0] = {
    name: "2026-11-01-payments.md",
    text: BUSINESS.replace(
      "1. When a user pays, the system shall record the payment. (must) — Verify: command — pay.sh → exit 0",
      ["1. When a user pays, the system shall record the payment.", "   (must) — Verify: command — pay.sh → exit 0"].join("\n"),
    ).replace(
      "2. When the card is declined, the system shall show the retry dialog. (must) — Verify: stand — the dialog shows",
      ["2. When the card is declined, the system shall show", "   the retry dialog. (must)"].join("\n"),
    ),
  };
  const r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => f.check === "orphan criteria" && /criterion 1/.test(f.finding)).length, 0);
  assert.equal(r.findings.filter((f) => f.check === "orphan criteria" && /criterion 2/.test(f.finding)).length, 1);
});

test("orphan criteria: the must marker and Verify label are bilingual", () => {
  const docs = happy();
  docs.specs[0] = {
    name: "2026-11-01-payments.md",
    text: BUSINESS.replace(
      "1. When a user pays, the system shall record the payment. (must) — Verify: command — pay.sh → exit 0",
      "1. При оплате система записывает платёж. (обязательно) — Проверка: pay.sh → exit 0",
    ).replace(
      "2. When the card is declined, the system shall show the retry dialog. (must) — Verify: stand — the dialog shows",
      "2. При отклонении карты система показывает диалог повтора. (обязательно)",
    ),
  };
  const r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => f.check === "orphan criteria" && /criterion 1/.test(f.finding)).length, 0); // Проверка: recognized
  assert.equal(r.findings.filter((f) => f.check === "orphan criteria" && /criterion 2/.test(f.finding)).length, 1);
});

test("orphan criteria: a must without Verify is a finding — in an English or a Russian spec", () => {
  const docs = happy();
  docs.specs[0] = {
    name: "2026-11-01-payments.md",
    text: BUSINESS.replace("2. When the card is declined, the system shall show the retry dialog. (must) — Verify: stand — the dialog shows", "2. When the card is declined, the system shall show the retry dialog. (must)"),
  };
  docs.specs[1] = {
    name: "2026-11-01-payments-api.md",
    text: ["---", "id: payments-api", "parent: payments", "---", "# Спека", "", "## Критерии приёмки", "", "1. При ошибке система отклоняет платёж. (must)"].join("\n"),
  };
  const r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => f.check === "orphan criteria" && /criterion 2/.test(f.finding)).length, 1);
  assert.equal(r.findings.filter((f) => f.check === "orphan criteria" && /2026-11-01-payments-api/.test(f.location)).length, 1);
});

test("test-id registry: an ID reused across artifacts, and twice in one", () => {
  const docs = happy();
  docs.tests.push({
    name: "2026-11-04-payments-api-cases.md",
    text: "## Cases\n\n| ID | Criterion | Type | Grader | State / input | Expected |\n|---|---|---|---|---|---|\n| TEST-PAY-001 | 1 | main | command | again | exit 0 |\n| TEST-PAY-002 | 1 | main | command | dup | x |\n| TEST-PAY-002 | 2 | main | command | dup | y |\n",
  });
  const r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => /TEST-PAY-001 also appears in/.test(f.finding)).length, 1);
  assert.equal(r.findings.filter((f) => /TEST-PAY-002 appears twice in this artifact/.test(f.finding)).length, 1);
});

test("stale blocking: a resolved question and a dead spec link are findings; an open one is not", () => {
  const docs = happy();
  const blocked = (ref) => ({
    name: "2026-11-02-payments-api.md",
    text: `# Plan\n\n## Task 2\n- Blocked by: open question #2 in ${ref}\n`,
  });
  docs.plans[0] = blocked("2026-11-01-payments.md"); // question #2 never existed (only #1)
  let r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => /no longer carries #2/.test(f.finding)).length, 1);

  docs.plans[0] = { name: "2026-11-02-payments-api.md", text: "# Plan\n\n## Task 2\n- Blocked by: open question #1 in 2026-11-01-payments.md\n" };
  r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => f.check === "stale blocking").length, 0); // #1 is open — the block is honest

  docs.plans[0] = blocked("2026-11-01-ghost.md");
  r = auditArtifacts(docs);
  assert.equal(r.findings.filter((f) => /names a spec the tree does not carry/.test(f.finding)).length, 1);
});

test("CLI: findings exit 1, a clean tree exits 0, an empty tree is nothing to check", () => {
  const dir = mkdtempSync(join(tmpdir(), "walk-cli-"));
  dirs.push(dir);
  const root = join(dir, "docs");
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "plans"), { recursive: true });
  writeFileSync(join(root, "specs", "2026-11-01-payments-api.md"), REPO_SPEC);
  writeFileSync(join(root, "specs", "2026-11-01-payments.md"), BUSINESS.replace("status: approved", "status: draft"));

  const bad = spawnSync(process.execPath, [WALK, root], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /status honesty: status draft with 1 child/);

  writeFileSync(join(root, "specs", "2026-11-01-payments.md"), BUSINESS);
  const good = spawnSync(process.execPath, [WALK, root], { encoding: "utf8" });
  assert.equal(good.status, 0);
  assert.match(good.stdout, /Done: 0 finding\(s\)/);
  assert.match(good.stdout, /no cases artifacts under .* — nothing to check there/);

  const empty = mkdtempSync(join(tmpdir(), "walk-empty-"));
  dirs.push(empty);
  mkdirSync(join(empty, "docs"), { recursive: true });
  const nothing = spawnSync(process.execPath, [WALK, join(empty, "docs")], { encoding: "utf8" });
  assert.equal(nothing.status, 0);
  assert.match(nothing.stdout, /nothing to check/);
});

test("dead citations: a task Source citing a section the parent spec does not carry", () => {
  const docs = happy();
  docs.specs[1] = {
    name: "2026-11-01-payments-api.md",
    text: ["---", "id: payments-api", "parent: payments", "status: approved", "---", "# Repo spec", "", "## 2. Changes", "- the pay endpoint", "", "## 5. Patterns", "- the repo's patterns"].join("\n"),
  };
  docs.plans[0] = {
    name: "2026-11-02-payments-api.md",
    text: ["---", "id: payments-api-plan", "parent: payments-api", "status: approved", "---", "# Plan", "", "### Task 1: pay", "- Source: [repo spec §2]", "- Files: `src/pay.ts`", "", "### Task 2: patterns", "- Source: [repo spec §9]", "- Files: `src/patterns.ts`", "", "### Task 3: prose", "- Source: [repo spec §2] — payment.id stays canonical"].join("\n"),
  };
  const r = auditArtifacts(docs);
  const dead = r.findings.filter((f) => f.check === "dead citation");
  assert.equal(dead.length, 1);
  assert.match(dead[0].finding, /§9/);
});
