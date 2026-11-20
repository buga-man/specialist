#!/usr/bin/env node
/**
 * check-criteria.mjs — the mechanical part of the acceptance-criteria quality bar
 * (skills/brainstorm/references/ears-patterns.md), run over a business spec before it
 * is saved. A judgment call (is the criterion sharp enough?) stays with the agent;
 * this script catches the failures that never need judgment:
 *
 *   - error:   a must criterion without a `Verify:` — nobody decided how it is checked;
 *   - warning: unmeasurable wording in a criterion ("fast", "robust", "properly"…)
 *              — every subjective word carries a number, an example, or an oracle;
 *   - warning: the must-criteria count outside the 5–20 band — too few is a scope
 *              question, too many is several features pretending to be one;
 *   - info:    a criterion that does not start with a known EARS stem — intentional
 *              when the team's working language differs from the stems.
 *
 * Usage: node check-criteria.mjs <spec.md>
 * Exit codes: 0 — no errors (warnings are advice), 1 — errors found, 2 — usage/IO trouble.
 * Fail-safe: a spec without an "Acceptance criteria" section is nothing to check, exit 0.
 */
import { readFileSync } from "node:fs";

const MUST_BAND_LOW = 5;
const MUST_BAND_HIGH = 20;

/** Subjective words that need a number, an example, or an oracle around them. */
const VAGUE = [
  "quick\\w*", "fast", "user-friendly", "robust\\w*", "seamless\\w*", "properly",
  "\\bcorrect(ly)?\\b", "efficient\\w*", "reliabl\\w*", "scalable", "flexible",
  "intuitive", "\\boptimal\\b", "significant(ly)?", "\\bbetter\\b", "appropriate",
  "adequate", "reasonable",
];
const VAGUE_RE = new RegExp(`\\b(?:${VAGUE.join("|")})\\b`, "i");

/** EARS stems — a criterion not starting with one is info, not an error. */
const STEM_RE = /^(?:when |while |if |where |the system (?:shall|should) |untrusted )/i;

/** The criteria-section heading, bilingual: the team's working language may be either.
 *  Cyrillic branches are prefix stems, not \b-bounded words — JS \b is ASCII-only
 *  and never fires around Cyrillic letters. */
const CRITERIA_HEADING_RE =
  /^#{1,6}\s*(?:\d+[.\s]*)?\s*(?:acceptance criteria\b|критери[а-яё]*\s+при[ёе]мк|при[ёе]мочн[а-яё]*\s+критери[а-яё]*)/i;

/** The must marker, bilingual: the team's working language may be either.
 *  Cyrillic branches are paren-anchored stems, not \b-bounded words — JS \b is
 *  ASCII-only and never fires around Cyrillic letters; the anchoring also keeps
 *  (необязательно) — optional — from reading as must. */
const MUST_RE = /\(\s*(?:must|обязательн[а-яё]*)\s*\)/i;

/** The should marker, bilingual: the should-class spellings — (should),
 *  (желательно), (опционально), (необязательно) — negotiable, never owed a
 *  Verify; paren-anchored for the same reason as MUST_RE. */
const SHOULD_RE = /\(\s*(?:should|желательн[а-яё]*|опциональн[а-яё]*|необязательн[а-яё]*)\s*\)/i;

/** The Verify label, bilingual: the stem matches through a leading non-letter —
 *  \b is ASCII-only, and «перепроверка:» must not count as a Verify. */
const VERIFY_RE = /(?:^|[^\p{L}])(?:verify|провер[а-яё]*)\s*:/iu;

const criteriaSection = (lines) => {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CRITERIA_HEADING_RE.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
};

/** The numbered criteria as whole multi-line items: a numbered line starts an item,
 *  the following non-empty lines continue it — long criteria wrap, and the (must)
 *  marker and the Verify tail may land on the wrap, not on the numbered line. */
const splitCriteria = (lines) => {
  const items = [];
  for (const raw of lines) {
    const m = /^\s*\d+\.\s+(.*)$/.exec(raw);
    if (m) {
      items.push(m[1]);
    } else if (items.length > 0 && raw.trim() !== "") {
      items[items.length - 1] += ` ${raw.trim()}`;
    }
  }
  return items;
};

export function checkCriteria(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const section = criteriaSection(lines);
  if (!section) return { found: false, errors: [], warnings: [], infos: [], mustCount: 0, shouldCount: 0 };

  const errors = [];
  const warnings = [];
  const infos = [];
  let mustCount = 0;
  let shouldCount = 0;
  let criterionNo = 0;

  for (const body of splitCriteria(section)) {
    criterionNo++;
    const isMust = MUST_RE.test(body);
    if (isMust) mustCount++;
    if (!isMust && SHOULD_RE.test(body)) shouldCount++;
    if (isMust && !VERIFY_RE.test(body)) {
      errors.push(`criterion ${criterionNo} (must) has no Verify — every must criterion names the command or the manual check that decides it`);
    }
    const vague = VAGUE_RE.exec(body);
    if (vague) {
      warnings.push(`criterion ${criterionNo} uses unmeasurable wording: "${vague[0]}" — anchor it with a number, an example, or an oracle`);
    }
    if (!STEM_RE.test(body)) {
      infos.push(`criterion ${criterionNo} does not start with a known EARS stem (When/While/If/Where/The system shall) — intentional if the working language differs`);
    }
  }

  if (mustCount > 0 && mustCount < MUST_BAND_LOW) {
    warnings.push(`only ${mustCount} must criteria — very few for a real feature; check that the walk covered error paths and boundaries`);
  }
  if (mustCount > MUST_BAND_HIGH) {
    warnings.push(`${mustCount} must criteria — more than ~${MUST_BAND_HIGH} means the scope is really several features; split it with the user`);
  }
  return { found: true, errors, warnings, infos, mustCount, shouldCount };
}

function main(argv) {
  const file = argv[0];
  if (!file) {
    console.error("check-criteria: usage: node check-criteria.mjs <spec.md>");
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    console.error(`check-criteria: cannot read ${file}: ${error && error.message ? error.message : error}`);
    process.exit(2);
  }

  const report = checkCriteria(text);
  if (!report.found) {
    console.log(`check-criteria: no "Acceptance criteria" section in ${file} — nothing to check`);
    process.exit(0);
  }

  console.log(`check-criteria: ${file} — ${report.mustCount} must criteria${report.shouldCount ? `, ${report.shouldCount} should` : ""}`);
  for (const line of report.errors) console.log(`  error: ${line}`);
  for (const line of report.warnings) console.log(`  warning: ${line}`);
  for (const line of report.infos) console.log(`  info: ${line}`);
  console.log(`Done: ${report.errors.length} error(s), ${report.warnings.length} warning(s), ${report.infos.length} info`);
  process.exit(report.errors.length ? 1 : 0);
}

// When imported by the tests, only checkCriteria runs; as a CLI, main() runs.
const isCli = process.argv[1] && process.argv[1].endsWith("check-criteria.mjs");
if (isCli) main(process.argv.slice(2));
