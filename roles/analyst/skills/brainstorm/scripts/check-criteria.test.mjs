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
      "1. When a client uploads a file larger than 100 MB, the system shall reject it with HTTP 413. (must) — Must-not: anything else in the upload path changes",
    ]),
  );
  assert.equal(bad.found, true);
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /criterion 1 \(must\) has no Verify/);

  const good = checkCriteria(
    SPEC([
      "1. When a client uploads a file larger than 100 MB, the system shall reject it with HTTP 413. (must) — Verify: pytest tests/upload_limit.py → exit 0 — Must-not: anything else in the upload path changes",
    ]),
  );
  assert.equal(good.errors.length, 0);
});

test("checkCriteria: unmeasurable wording is a warning naming the word", () => {
  const r = checkCriteria(
    SPEC([
      "1. The system shall handle uploads fast. (must) — Verify: manual — time the upload — Must-not: retries are added",
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
      "1. Uploads larger than the limit are rejected with HTTP 413. (must) — Verify: cmd → 0 — Must-not: the limit moves",
    ]),
  );
  assert.equal(r.errors.length, 0);
  assert.equal(r.infos.length, 1);
  assert.match(r.infos[0], /EARS stem/);

  const stemmed = checkCriteria(
    SPEC([
      "1. When the upload exceeds the limit, the system shall return HTTP 413. (must) — Verify: cmd → 0 — Must-not: the limit moves",
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
      "   with HTTP 413. (must) — Verify: pytest tests/upload_limit.py → exit 0 — Must-not: anything else changes",
      "2. When the list is empty, the system shall show the empty state",
      "(must) — Verify: manual — QA observes the empty page — Must-not: the list is rewritten",
    ]),
  );
  assert.equal(r.mustCount, 2);
  assert.equal(r.errors.length, 0);

  const unverified = checkCriteria(
    SPEC([
      "1. When a client uploads a file larger than 100 MB, the system shall reject it",
      "   with HTTP 413. (must) — Must-not: anything else changes",
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
      "1. При отправке система сохраняет запись. (обязательно) — Проверка: manual — QA наблюдает — Недопустимо: запись дублируется",
      "2. При ошибке ввода система отклоняет форму. (обязательно) — Недопустимо: форма очищается",
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
      "1. When X, the system shall Y. (must) — Must-not: Z changes",
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

const SPEC_WITH_QUESTIONS = (rows) => [
  "# Feature — business specification",
  "",
  "## 3. Acceptance criteria",
  ...Array.from({ length: 6 }, (_, i) => `${i + 1}. When X${i}, the system shall Y${i}. (must) — Verify: cmd${i} → 0 — Must-not: anything else changes`),
  "",
  "## 7. Open questions",
  "| # | Question | Working assumption | Risk if wrong | Blocking |",
  "|---|---|---|---|---|",
  ...rows,
].join("\n");

test("checkCriteria: more than three blocking open questions is a warning — three is the budget", () => {
  const farm = checkCriteria(SPEC_WITH_QUESTIONS([
    "| 1 | Which auth? | OAuth2 | rework | yes |",
    "| 2 | Retention? | 90 days | compliance | yes |",
    "| 3 | Who pays? | the org | pricing wrong | yes |",
    "| 4 | Mobile? | out of scope | a second feature | yes |",
  ]));
  assert.equal(farm.errors.length, 0);
  assert.equal(farm.blockingOpen, 4);
  assert.ok(farm.warnings.some((w) => /4 blocking open questions/.test(w) && /picture is not one yet/.test(w)));

  const within = checkCriteria(SPEC_WITH_QUESTIONS([
    "| 1 | Which auth? | OAuth2 | rework | yes |",
    "| 2 | Retention? | 90 days | compliance | yes |",
    "| 3 | Mobile? | out of scope | a second feature | no |", // not blocking — inside the budget
  ]));
  assert.equal(within.blockingOpen, 2);
  assert.ok(!within.warnings.some((w) => /blocking open questions/.test(w)));
});

test("checkCriteria: the open-questions section is bilingual and non-blocking rows never count", () => {
  const ru = [
    "# Спека", "",
    "## Критерии приёмки", "",
    ...Array.from({ length: 6 }, (_, i) => `${i + 1}. При X${i} система делает Y${i}. (обязательно) — Проверка: cmd${i} → 0`),
    "",
    "## 7. Открытые вопросы",
    "| # | Вопрос | Допущение | Риск | Блокирующий |",
    "|---|---|---|---|---|",
    "| 1 | Какая авторизация? | OAuth2 | переделка | да |",
    "| 2 | Хранение данных? | 90 дней | комплаенс | да, до согласования |",
    "| 3 | Мобильная версия? | вне масштаба | второй продукт | нет |",
  ].join("\n");
  const r = checkCriteria(ru);
  assert.equal(r.blockingOpen, 2); // да and «да, до…» block; нет does not
  assert.ok(!r.warnings.some((w) => /blocking open questions/.test(w)));
});

test("checkCriteria: no open-questions section or table — blocking check is silently off (fail-safe)", () => {
  const without = checkCriteria(SPEC(["1. When X, the system shall Y. (must) — Verify: cmd → 0"]));
  assert.equal(without.blockingOpen, 0);
  assert.ok(!without.warnings.some((w) => /blocking/.test(w)));

  const proseOnly = checkCriteria([
    "# Спека", "",
    "## 3. Acceptance criteria",
    ...Array.from({ length: 6 }, (_, i) => `${i + 1}. When X${i}, the system shall Y${i}. (must) — Verify: cmd${i} → 0`),
    "",
    "## 7. Open questions",
    "No table here — just a prose line mentioning blocking.",
  ].join("\n"));
  assert.equal(proseOnly.blockingOpen, 0);
});

test("checkCriteria: a must criterion without Must-not is an error — bilingual, and should owes no boundary", () => {
  const bad = checkCriteria(SPEC(["1. When X, the system shall Y. (must) — Verify: cmd → 0"]));
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /criterion 1 \(must\) has no Must-not/);
  assert.match(bad.errors[0], /license to overreach/);

  const good = checkCriteria(
    SPEC(["1. When X, the system shall Y. (must) — Verify: cmd → 0 — Must-not: anything else changes"]),
  );
  assert.equal(good.errors.length, 0);

  // «Недопустимо:» carries exactly the weight of `Must-not:`
  const ru = checkCriteria([
    "# Спека", "",
    "## Критерии приёмки", "",
    "1. При отправке система сохраняет запись. (обязательно) — Проверка: manual — Недопустимо: запись теряется",
  ].join("\n"));
  assert.equal(ru.errors.length, 0);

  // The should class owes no boundary, same as it owes no Verify
  const should = checkCriteria(
    SPEC(["1. Where the user has not interacted for 30 seconds, the system should collapse the panel. (should)"]),
  );
  assert.equal(should.errors.length, 0);
});
