/**
 * Tests for skills/test-design/scripts/cases.mjs — the cases-artifact contract.
 * Run: node --test skills/test-design/scripts/cases.mjs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCases, parseCases, parseCriteria } from "./cases.mjs";

const SPEC = [
  "# Feature spec", "",
  "## Acceptance criteria", "",
  "1. When a user submits, the system shall save. (must) — Verify: command — x",
  "2. When the list is empty, the system shall hint. (must) — Verify: command — y",
  "3. The export shall offer CSV. (should)",
].join("\n");

const casesTable = (rows) =>
  ["# T", "", "## Cases", "",
   "| ID | Criterion | Type | Grader | State / input | Expected |",
   "|---|---|---|---|---|---|",
   ...rows].join("\n");

test("parseCases: header order is free, the separator row is skipped", () => {
  const rows = parseCases(casesTable([
    "| TEST-FEA-001 | 1 | main | command | valid submit | saved, exit 0 |",
    "| TEST-FEA-002 | 2 | boundary | stand | empty list | the hint shows |",
  ]));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    line: 7, id: "TEST-FEA-001", criterion: "1", type: "main",
    grader: "command", state: "valid submit", expected: "saved, exit 0",
  });
  assert.equal(rows[1].type, "boundary");
});

test("the happy artifact holds — coverage both ways, no errors", () => {
  const text = casesTable([
    "| TEST-FEA-001 | 1 | main | command | valid submit | saved, exit 0 |",
    "| TEST-FEA-002 | 1 | exception | command | API 503 | retry dialog, data kept |",
    "| TEST-FEA-003 | 2 | boundary | stand | empty list | the hint shows |",
    "| TEST-FEA-004 | — | regression | command | double submit | one record (source: audit) |",
  ]);
  const r = checkCases(text, [SPEC]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.notes.filter((n) => /criterion 3/.test(n)).length, 1); // should without a case — a note
});

test("malformed and duplicate IDs, unknown grader/type, missing cells are errors", () => {
  const text = casesTable([
    "| TEST-001 | 1 | main | command | x | y |",               // no TOPIC segment
    "| TEST-FEA-1 | 1 | main | command | x | y |",              // too few digits
    "| TEST-FEA-001 | 1 | main | command | x | y |",
    "| TEST-FEA-001 | 1 | main | command | x | y |",            // duplicate
    "| TEST-FEA-002 | 1 | happy | command | x | y |",           // unknown type
    "| TEST-FEA-003 | 1 | main | vibe | x | y |",               // unknown grader
    "| TEST-FEA-004 | 1 | main | command | x |",                // no Expected
    "| TEST-FEA-005 | 1 | main | command | x | y |",
    "| TEST-FEA-006 | 2 | main | command | x | y |",
  ]);
  const r = checkCases(text, [SPEC]);
  assert.equal(r.errors.filter((e) => /malformed TEST-ID/.test(e)).length, 2);
  assert.equal(r.errors.filter((e) => /duplicate TEST-ID/.test(e)).length, 1);
  assert.equal(r.errors.filter((e) => /unknown type "happy"/.test(e)).length, 1);
  assert.equal(r.errors.filter((e) => /unknown grader "vibe"/.test(e)).length, 1);
  assert.equal(r.errors.filter((e) => /no Expected cell/.test(e)).length, 1);
  assert.equal(r.errors.filter((e) => /criterion \d+ \(must\) is exercised by no case/.test(e)).length, 0); // 1 and 2 covered
});

test("an unknown criterion reference and an uncovered must criterion are errors", () => {
  const text = casesTable([
    "| TEST-FEA-001 | 1 | main | command | x | y |",
    "| TEST-FEA-002 | 9 | exception | command | x | y |",
  ]);
  const r = checkCases(text, [SPEC]);
  assert.equal(r.errors.filter((e) => /references criterion 9/.test(e)).length, 1);
  assert.equal(r.errors.filter((e) => /criterion 2 \(must\) is exercised by no case/.test(e)).length, 1);
});

test("a criterion-less row is a note unless it is a regression row", () => {
  const base = [
    "| TEST-FEA-001 | 1 | main | command | x | y |",
    "| TEST-FEA-002 | 2 | main | command | x | y |",
  ];
  const withRegression = checkCases(casesTable([
    ...base,
    "| TEST-FEA-003 | — | regression | command | double submit | one record |",
  ]), [SPEC]);
  assert.equal(withRegression.notes.filter((n) => /criterion-less/.test(n)).length, 0);

  const withBare = checkCases(casesTable([
    ...base,
    "| TEST-FEA-003 | — | main | command | double submit | one record |",
  ]), [SPEC]);
  assert.equal(withBare.notes.filter((n) => /criterion-less/.test(n)).length, 1);
});

test("parseCriteria: must wins when the number repeats across specs", () => {
  const other = [
    "# Other", "",
    "## Acceptance criteria", "",
    "1. Same number, now must. (must)",
  ].join("\n");
  const criteria = parseCriteria([SPEC, other]);
  assert.equal(criteria.size, 3);
  assert.equal(criteria.get(1).must, true);
  assert.equal(criteria.get(3).must, false);
});

test("parseCriteria: the heading is bilingual — a Russian spec's criteria are read, not skipped", () => {
  const ru = [
    "# Спека", "",
    "## Критерии приёмки", "",
    "1. При отправке система сохраняет запись. (must) — Verify: command — save.sh → exit 0",
    "2. При пустом списке система показывает подсказку. (should)",
  ].join("\n");
  const criteria = parseCriteria([ru]);
  assert.equal(criteria.size, 2);
  assert.equal(criteria.get(1).must, true);
  assert.equal(criteria.get(2).must, false);
});

test("a number carried by more than one spec is a collision note; must still governs coverage", () => {
  const other = [
    "# Repo spec", "",
    "## Приёмочные критерии", "",
    "1. Другой критерий с тем же номером. (should)",
  ].join("\n");
  const cases = casesTable([
    "| TEST-FEA-001 | 1 | main | command | valid submit | saved, exit 0 |",
    "| TEST-FEA-002 | 2 | boundary | command | empty list | the hint shows |",
  ]);
  const r = checkCases(cases, [SPEC, other]);
  assert.equal(r.notes.filter((n) => /criterion 1 is numbered in 2 of the given specs/.test(n)).length, 1);
  // the business spec's must (not the repo spec's should) still decides the coverage side
  assert.equal(r.errors.filter((e) => /criterion 1 \(must\) is exercised by no case/.test(e)).length, 0);
});
