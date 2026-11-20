/**
 * Tests for skills/test-analysis/scripts/probe.mjs — the spec-probe script.
 * Run: node --test skills/test-analysis/scripts/probe.mjs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeSpec } from "./probe.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = join(HERE, "probe.mjs");
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const criteria = (...rows) => `# Spec\n\n## Acceptance criteria\n\n${rows.join("\n")}\n`;

test("a must criterion without Verify is an error; a duplicate text is an error", () => {
  const text = criteria(
    "1. When a user submits, the system shall save the record. (must) — Verify: command — save.sh → exit 0",
    "2. When a user submits, the system shall save the record. (must) — Verify: command — save.sh → exit 0",
    "3. If the input is invalid, the system shall reject it. (must)",
  );
  const r = probeSpec(text);
  assert.equal(r.found, true);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /^criterion 2 repeats criterion 1/);
  assert.match(r.errors[1], /criterion 3 \(must\) has no Verify/);
});

test("the Verify tail and must/should marks are stripped before comparing duplicates", () => {
  const text = criteria(
    "1. While the night mode is on, the screen shall dim. (must) — Verify: stand — the screen dims",
    "2. While the night mode is on, the screen shall dim! (should) — Verify: manual — QA observes",
  );
  assert.equal(probeSpec(text).errors.length, 1); // punctuation aside, the texts are one
});

test("vague wording in both languages is a warning", () => {
  const en = probeSpec(criteria(
    "1. The search shall be fast. (must) — Verify: manual — x",
    "2. When a user exports, the system shall produce a file. (must) — Verify: manual — y",
    "3. If the file is locked, the system shall show an error. (must) — Verify: manual — z",
    "4. When the list is empty, the system shall show a hint. (must) — Verify: manual — w",
    "5. On max input, the system shall truncate. (must) — Verify: manual — v",
  ));
  assert.equal(en.warnings.filter((w) => /"fast"/.test(w)).length, 1);

  const ru = probeSpec(criteria(
    "1. Система должна быть удобной. (must) — Verify: manual — x",
    "2. При ошибке ввода система отклоняет форму. (must) — Verify: manual — y",
    "3. При пустом списке система показывает подсказку. (must) — Verify: manual — z",
    "4. При превышении максимума система обрезает ввод. (must) — Verify: manual — w",
    "5. Система отвечает за корректный расчёт суммы. (must) — Verify: manual — v",
  ));
  assert.equal(ru.warnings.filter((w) => /"удобной"/.test(w)).length, 1);
  assert.equal(ru.warnings.filter((w) => /"корректный"/.test(w)).length, 1);
  // and the Russian error/boundary words feed the axis signals, not silence them
  assert.equal(ru.signals.length, 0);
});

test("hole signals — error path, boundary, dual mode", () => {
  const base = (extra = []) => criteria(
    "1. When a user submits, the system shall save. (must) — Verify: manual — x",
    "2. When a user lists, the system shall render. (must) — Verify: manual — y",
    "3. When a user exports, the system shall produce a file. (must) — Verify: manual — z",
    "4. When a user deletes, the system shall confirm. (must) — Verify: manual — w",
    "5. When a user edits, the system shall persist. (must) — Verify: manual — v",
    ...extra,
  );
  const bare = probeSpec(base());
  assert.equal(bare.signals.filter((s) => /error-path/.test(s)).length, 1);
  assert.equal(bare.signals.filter((s) => /boundary/.test(s)).length, 1);
  assert.equal(bare.signals.filter((s) => /dual-mode/.test(s)).length, 0); // no mode words anywhere

  const withMode = probeSpec(criteria(
    "1. The system has a sandbox mode. (must) — Verify: manual — x",
    "2. When a user submits, the system shall save. (must) — Verify: manual — y",
    "3. If the input is invalid, the system shall reject it. (must) — Verify: manual — z",
    "4. When the list is empty, the system shall show a hint. (must) — Verify: manual — w",
    "5. On max input, the system shall truncate. (must) — Verify: manual — v",
  ));
  assert.equal(withMode.signals.filter((s) => /dual-mode/.test(s)).length, 1);

  const bothModes = probeSpec(criteria(
    "1. The flag on and off both keep the invariant. (must) — Verify: manual — x",
    "2. If the input is invalid, the system shall reject it. (must) — Verify: manual — y",
    "3. When the list is empty, the system shall show a hint. (must) — Verify: manual — z",
    "4. On max input, the system shall truncate. (must) — Verify: manual — w",
    "5. When a user submits, the system shall save. (must) — Verify: manual — v",
  ));
  assert.equal(bothModes.signals.filter((s) => /dual-mode/.test(s)).length, 0);
});

test("a wrapped criterion keeps its marker, Verify, and dedupe text across lines", () => {
  const text = criteria(
    "1. When a user submits, the system shall save the record.",
    "   (must) — Verify: command — save.sh → exit 0",
    "2. When a user submits, the system shall save the record.",
    "   (must) — Verify: command — save.sh → exit 0",
    "3. If the input is invalid,",
    "   the system shall reject it. (must)",
  );
  const r = probeSpec(text);
  assert.equal(r.mustCount, 3);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /^criterion 2 repeats criterion 1/);
  assert.match(r.errors[1], /criterion 3 \(must\) has no Verify/);
});

test("the markers are bilingual — Cyrillic musts are counted, deduped, and Verify-checked", () => {
  const text = criteria(
    "1. При отправке система сохраняет запись. (обязательно) — Проверка: save.sh → exit 0",
    "2. При отправке система сохраняет запись! (обязательно) — Проверка: save.sh → exit 0",
    "3. При пустом списке система показывает подсказку. (желательно)",
    "4. Отчёт можно выгрузить. (необязательно)",
  );
  const r = probeSpec(text);
  assert.equal(r.mustCount, 2); // (желательно) and (необязательно) are not musts
  assert.equal(r.shouldCount, 2); // they are the should class
  assert.equal(r.errors.filter((e) => /^criterion 2 repeats criterion 1/).length, 1); // Cyrillic markers and tails stripped before comparing
  assert.equal(r.errors.filter((e) => /has no Verify/.test(e)).length, 0); // Проверка: counts
});

test("a spec without an acceptance-criteria section is nothing to probe", () => {
  const r = probeSpec("# Notes\n\nJust prose.\n");
  assert.equal(r.found, false);
  assert.equal(r.mustCount, 0);
});

test("the criteria-section heading is bilingual — a Russian spec is probed, not skipped", () => {
  const ru = (heading) => [
    "# Спека", "",
    `## ${heading}`, "",
    "1. Система должна быть удобной. (must)",
    "2. При ошибке ввода система отклоняет форму. (must) — Verify: manual — QA наблюдает",
  ].join("\n");
  for (const heading of ["Критерии приёмки", "Критерии приемки", "Приёмочные критерии", "3. Критерии приёмки"]) {
    const r = probeSpec(ru(heading));
    assert.equal(r.found, true, heading);
    assert.equal(r.errors.filter((e) => /criterion 1 \(must\) has no Verify/.test(e)).length, 1, heading);
    assert.equal(r.warnings.filter((w) => /"удобной"/.test(w)).length, 1, heading);
  }
  // a heading that names none of the section's languages is still nothing to probe
  assert.equal(probeSpec("# Спека\n\n## Требования\n\n1. Система работает. (must)\n").found, false);
});

test("CLI: errors exit 1, a clean spec exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "probe-cli-"));
  dirs.push(dir);
  const bad = join(dir, "bad.md");
  writeFileSync(bad, criteria("1. The system shall work. (must)"));
  const r1 = spawnSync(process.execPath, [PROBE, bad], { encoding: "utf8" });
  assert.equal(r1.status, 1);
  assert.match(r1.stdout, /error: criterion 1 \(must\) has no Verify/);

  const good = join(dir, "good.md");
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    rows.push(`${i}. When a user acts ${i}, the system shall respond ${i}. (must) — Verify: manual — check ${i}`);
  }
  writeFileSync(good, criteria(...rows));
  const r2 = spawnSync(process.execPath, [PROBE, good], { encoding: "utf8" });
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /Done: 0 error\(s\)/);
});
