/**
 * Tests for skills/brainstorm/scripts/check-criteria.mjs — the mechanical part of the
 * acceptance-criteria quality bar.
 * Run: node --test skills/brainstorm/scripts/check-criteria.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCriteria } from "./check-criteria.mjs";

const SPEC = (criteria) => [
  "# Feature — business specification",
  "",
  "## 3. Acceptance criteria",
  ...criteria,
  "",
  "## 4. Business cases",
].join("\n");

test("checkCriteria: a must criterion without Verify is an error; with one — clean", () => {
  const bad = checkCriteria(
    SPEC([
      "1. When a client uploads a file larger than 100 MB, the system shall reject it with HTTP 413. (must)",
    ]),
  );
  assert.equal(bad.found, true);
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /criterion 1 \(must\) has no Verify/);

  const good = checkCriteria(
    SPEC([
      "1. When a client uploads a file larger than 100 MB, the system shall reject it with HTTP 413. (must) — Verify: pytest tests/upload_limit.py → exit 0",
    ]),
  );
  assert.equal(good.errors.length, 0);
});

test("checkCriteria: unmeasurable wording is a warning naming the word", () => {
  const r = checkCriteria(
    SPEC([
      "1. The system shall handle uploads fast. (must) — Verify: manual — time the upload",
    ]),
  );
  assert.equal(r.errors.length, 0);
  assert.ok(r.warnings.some((w) => /"fast"/.test(w)));
  // "properly" inside a Verify command does not exist in this fixture; the statement is scanned.
  const clean = checkCriteria(
    SPEC(Array.from({ length: 6 }, (_, i) => `${i + 1}. When X${i}, the system shall return HTTP 413 for ${i}. (must) — Verify: pytest -k limit${i} → exit 0`)),
  );
  assert.equal(clean.warnings.length, 0);
});

test("checkCriteria: the must-count band — too few and too many warn, the band is silent", () => {
  const one = checkCriteria(SPEC(["1. When X, the system shall Y. (must) — Verify: cmd → 0"]));
  assert.ok(one.warnings.some((w) => /very few/.test(w)));

  const inBand = checkCriteria(
    SPEC(Array.from({ length: 6 }, (_, i) => `${i + 1}. When X${i}, the system shall Y${i}. (must) — Verify: cmd${i} → 0`)),
  );
  assert.ok(!inBand.warnings.some((w) => /must criteria/.test(w)));

  const many = checkCriteria(
    SPEC(Array.from({ length: 21 }, (_, i) => `${i + 1}. When X${i}, the system shall Y${i}. (must) — Verify: cmd${i} → 0`)),
  );
  assert.ok(many.warnings.some((w) => /several features/.test(w)));
});

test("checkCriteria: a non-EARS stem is info, not an error (working language may differ)", () => {
  const r = checkCriteria(
    SPEC([
      "1. Uploads larger than the limit are rejected with HTTP 413. (must) — Verify: cmd → 0",
    ]),
  );
  assert.equal(r.errors.length, 0);
  assert.equal(r.infos.length, 1);
  assert.match(r.infos[0], /EARS stem/);

  const stemmed = checkCriteria(
    SPEC([
      "1. When the upload exceeds the limit, the system shall return HTTP 413. (must) — Verify: cmd → 0",
    ]),
  );
  assert.equal(stemmed.infos.length, 0);
});

test("checkCriteria: no Acceptance-criteria section — nothing to check; should criteria need no Verify", () => {
  assert.equal(checkCriteria("# A doc without criteria\n\nSome prose.\n").found, false);

  const r = checkCriteria(
    SPEC([
      "1. Where the user has not interacted for 30 seconds, the system should collapse the panel. (should)",
    ]),
  );
  assert.equal(r.errors.length, 0);
  assert.equal(r.mustCount, 0);
});

test("checkCriteria: a wrapped criterion keeps its (must) marker and Verify tail across lines", () => {
  const r = checkCriteria(
    SPEC([
      "1. When a client uploads a file larger than 100 MB, the system shall reject it",
      "   with HTTP 413. (must) — Verify: pytest tests/upload_limit.py → exit 0",
      "2. When the list is empty, the system shall show the empty state",
      "(must) — Verify: manual — QA observes the empty page",
    ]),
  );
  assert.equal(r.mustCount, 2);
  assert.equal(r.errors.length, 0);

  const unverified = checkCriteria(
    SPEC([
      "1. When a client uploads a file larger than 100 MB, the system shall reject it",
      "   with HTTP 413. (must)",
    ]),
  );
  assert.equal(unverified.errors.length, 1);
  assert.match(unverified.errors[0], /criterion 1 \(must\) has no Verify/);

  const vagueWrap = checkCriteria(
    SPEC([
      "1. When a client uploads, the system shall be",
      "",
      "   fast about it. (must) — Verify: manual — time it",
    ]),
  );
  assert.ok(vagueWrap.warnings.some((w) => /"fast"/.test(w)));
});

test("checkCriteria: the must/should/Verify markers are bilingual — Cyrillic specs are graded, not silenced", () => {
  const r = checkCriteria(
    [
      "# Спека", "",
      "## Критерии приёмки", "",
      "1. При отправке система сохраняет запись. (обязательно) — Проверка: manual — QA наблюдает",
      "2. При ошибке ввода система отклоняет форму. (обязательно)",
      "3. При пустом списке система показывает подсказку. (желательно)",
      "4. Отчёт можно выгрузить. (необязательно)",
    ].join("\n"),
  );
  assert.equal(r.mustCount, 2);
  assert.equal(r.shouldCount, 2); // (желательно) and (необязательно) — the should class, never musts
  assert.equal(r.errors.filter((e) => /criterion 1 /.test(e)).length, 0); // Проверка: counts as Verify
  assert.equal(r.errors.filter((e) => /criterion 2 \(must\) has no Verify/.test(e)).length, 1);
  assert.equal(r.errors.filter((e) => /criterion 3|criterion 4/.test(e)).length, 0); // should / optional — no Verify owed
});

test("checkCriteria: the section scan stops at the next heading", () => {
  const r = checkCriteria(
    [
      "## 3. Acceptance criteria",
      "1. When X, the system shall Y. (must)",
      "",
      "## 4. Business cases",
      "1. Actor does something — this numbered item is NOT a criterion",
    ].join("\n"),
  );
  assert.equal(r.mustCount, 1);
  assert.equal(r.errors.length, 1); // only the real criterion is checked
});

test("checkCriteria: the criteria heading is bilingual — a Russian spec is checked, not skipped", () => {
  const ru = (heading) => [
    "# Спека", "",
    `## ${heading}`, "",
    "1. При отправке система сохраняет запись. (must) — Verify: manual — QA наблюдает",
    "2. Система должна быть удобной. (must)",
    "3. При ошибке ввода система отклоняет форму. (must) — Verify: manual — QA наблюдает",
  ].join("\n");
  for (const heading of ["Критерии приёмки", "Приёмочные критерии", "7. Критерии приёмки"]) {
    const r = checkCriteria(ru(heading));
    assert.equal(r.found, true, heading);
    assert.equal(r.mustCount, 3, heading);
    assert.equal(r.errors.filter((e) => /criterion 2 \(must\) has no Verify/.test(e)).length, 1, heading);
  }
  // a heading in neither language still means nothing to check
  assert.equal(checkCriteria("# Спека\n\n## Требования\n\n1. Система работает. (must)\n").found, false);
});
