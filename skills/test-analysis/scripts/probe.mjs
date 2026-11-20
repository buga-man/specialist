#!/usr/bin/env node
/**
 * probe.mjs — the mechanical part of the test-analysis pass over a specification.
 * Where brainstorm's check-criteria.mjs guards the bar at authoring time, this runs
 * later, over an existing spec, hunting what needs no judgment:
 *
 *   - error:   a must criterion without a `Verify:` — nobody decided how it is checked;
 *   - error:   two criteria with the same normalized text — one of them is drift;
 *   - warning: unmeasurable wording (the bilingual vague list — the team's working
 *              language may be either);
 *   - warning: the must-criteria count outside the 5–20 band;
 *   - signal:  hole axes with no criterion on them — no error-path criterion, no
 *              boundary criterion, dual-mode keywords present but no both-modes
 *              criterion. Signals advise the judgment passes, they do not convict.
 *
 * Usage: node probe.mjs <spec.md>
 * Exit codes: 0 — no errors (warnings/signals are advice), 1 — errors, 2 — usage/IO.
 * Fail-safe: a spec without an "Acceptance criteria" section is nothing to probe, exit 0.
 */
import { readFileSync } from "node:fs";

const MUST_BAND_LOW = 5;
const MUST_BAND_HIGH = 20;

/** Subjective words that need a number, an example, or an oracle around them.
 *  ASCII words use \w tails; Cyrillic needs its own class — \w is ASCII-only. */
const VAGUE = [
  "quick\\w*", "fast", "user-friendly", "robust\\w*", "seamless\\w*", "properly",
  "\\bcorrect(ly)?\\b", "efficient\\w*", "reliabl\\w*", "scalable", "flexible",
  "intuitive", "\\boptimal\\b", "significant(ly)?", "\\bbetter\\b", "appropriate",
  "adequate", "reasonable",
  "быстр[а-яё]*", "удобн[а-яё]*", "корректн[а-яё]*", "над[её]жн[а-яё]*",
  "стабильн[а-яё]*", "правильн[а-яё]*", "гибк[а-яё]*", "оптимальн[а-яё]*",
  "значительн[а-яё]*",
];
const VAGUE_RE = new RegExp(`(?:\\b|(?:^|[^а-яёa-z]))(?:${VAGUE.join("|")})(?:\\b|(?=$|[^а-яёa-z]))`, "i");

/** Keywords of the hole axes; a criterion section that never touches an axis raises a
 *  signal. ASCII keywords use \b word boundaries; Cyrillic stems are matched as
 *  substrings — JS \b is ASCII-only and never fires around Cyrillic letters. The
 *  stems are deliberately prefixes (ошибк → ошибке/ошибку): signals advise, they
 *  do not convict. */
const ERROR_PATH_RE = /\b(?:error|fail|invalid|reject|denied|timeout|rollback)\b|ошибк|отказ|невозможн|недопустим|откат/i;
const BOUNDARY_RE = /\b(?:empty|null|zero|max(?:imum)?|limit|boundary|negative|unicode|timezone|dst)\b|пуст[а-яё]|нул[а-яё]|максим|предел|гранич|отрицательн/i;
const DUAL_MODE_RE = /\b(?:mode|flag|sandbox|production|dev|prod|staging)\b|режим|флаг|песочниц|боев/i;
const BOTH_MODES_RE = /\b(?:both\s+modes|each\s+mode|mode\s+is\s+(?:on|off)|on\s+and\s+off)\b|в\s+обоих\s+режим|для\s+каждого\s+режим|включ[её]н\s+и\s+выключен/i;

/** The criteria-section heading, bilingual: the team's working language may be either.
 *  Cyrillic branches are prefix stems, not \b-bounded words — JS \b is ASCII-only
 *  and never fires around Cyrillic letters (the same doctrine as VAGUE below). */
const CRITERIA_HEADING_RE =
  /^#{1,6}\s*(?:\d+[.\s]*)?\s*(?:acceptance criteria\b|критери[а-яё]*\s+при[ёе]мк|при[ёе]мочн[а-яё]*\s+критери[а-яё]*)/i;

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

/** The must/should markers, bilingual: Cyrillic branches are paren-anchored stems
 *  (no \b — ASCII-only; the anchoring keeps (необязательно) from reading as must —
 *  it is a should-class spelling). The Verify label matches through a leading
 *  non-letter, so «перепроверка:» does not count. */
const MUST_RE = /\(\s*(?:must|обязательн[а-яё]*)\s*\)/i;
const SHOULD_RE = /\(\s*(?:should|желательн[а-яё]*|опциональн[а-яё]*|необязательн[а-яё]*)\s*\)/i;
const MARKERS_RE = /\(\s*(?:must|should|обязательн[а-яё]*|желательн[а-яё]*|опциональн[а-яё]*|необязательн[а-яё]*)\s*\)/gi;
const VERIFY_RE = /(?:^|[^\p{L}])(?:verify|провер[а-яё]*)\s*:/iu;

/** The comparable form of a criterion body — case-folded, punctuation and the
 *  must/should/Verify tail stripped, whitespace collapsed. */
const normalizeCriterion = (body) =>
  body
    .toLowerCase()
    .replace(MARKERS_RE, "")
    .replace(/[-—]?\s*verify\s*:.*$/i, "")
    .replace(/[-—]?\s*провер[а-яё]*\s*:.*$/i, "")
    .replace(/[.,;:!?«»"'`()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The probe report over a spec text: { found, errors, warnings, signals, mustCount }.
 * Pure — reads nothing; the CLI wrapper owns the file.
 * @param {string} text — the whole spec.
 */
export function probeSpec(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const section = criteriaSection(lines);
  if (!section) return { found: false, errors: [], warnings: [], signals: [], mustCount: 0, shouldCount: 0 };

  const errors = [];
  const warnings = [];
  const signals = [];
  const seen = new Map();
  let mustCount = 0;
  let shouldCount = 0;
  let criterionNo = 0;
  let hasErrorPath = false;
  let hasBoundary = false;
  let dualModeInSpec = DUAL_MODE_RE.test(section.join("\n")) || DUAL_MODE_RE.test(lines.join("\n"));
  let hasBothModes = false;

  for (const body of splitCriteria(section)) {
    criterionNo++;
    const isMust = MUST_RE.test(body);
    if (isMust) mustCount++;
    if (!isMust && SHOULD_RE.test(body)) shouldCount++;
    if (isMust && !VERIFY_RE.test(body)) {
      errors.push(`criterion ${criterionNo} (must) has no Verify — every must criterion names the command or the manual check that decides it`);
    }
    const key = normalizeCriterion(body);
    if (key) {
      if (seen.has(key)) {
        errors.push(`criterion ${criterionNo} repeats criterion ${seen.get(key)} — one of the two is drift`);
      } else {
        seen.set(key, criterionNo);
      }
    }
    const vague = VAGUE_RE.exec(body);
    if (vague) {
      // The Cyrillic branch matches through a preceding non-letter, so the capture
      // can carry a leading space — the report quotes the word itself.
      warnings.push(`criterion ${criterionNo} uses unmeasurable wording: "${vague[0].trim()}" — anchor it with a number, an example, or an oracle`);
    }
    if (ERROR_PATH_RE.test(body)) hasErrorPath = true;
    if (BOUNDARY_RE.test(body)) hasBoundary = true;
    if (BOTH_MODES_RE.test(body)) hasBothModes = true;
  }

  if (mustCount > 0 && mustCount < MUST_BAND_LOW) {
    warnings.push(`only ${mustCount} must criteria — very few for a real feature; check that the walk covered error paths and boundaries`);
  }
  if (mustCount > MUST_BAND_HIGH) {
    warnings.push(`${mustCount} must criteria — more than ~${MUST_BAND_HIGH} means the scope is really several features; split it with the user`);
  }
  if (mustCount > 0 && !hasErrorPath) {
    signals.push("no error-path criterion — the walk over failure outcomes (§3 holes) has work to do");
  }
  if (mustCount > 0 && !hasBoundary) {
    signals.push("no boundary criterion — the boundaries axis (§5) has not been written down");
  }
  if (dualModeInSpec && !hasBothModes) {
    signals.push("the spec names modes/flags but no criterion checks both — the dual-mode axis is an open hole");
  }

  return { found: true, errors, warnings, signals, mustCount, shouldCount };
}

function main(argv) {
  const file = argv[0];
  if (!file) {
    console.error("probe: usage: node probe.mjs <spec.md>");
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    console.error(`probe: cannot read ${file}: ${error && error.message ? error.message : error}`);
    process.exit(2);
  }

  const report = probeSpec(text);
  if (!report.found) {
    console.log(`probe: no "Acceptance criteria" section in ${file} — nothing to probe`);
    process.exit(0);
  }

  console.log(`probe: ${file} — ${report.mustCount} must criteria${report.shouldCount ? `, ${report.shouldCount} should` : ""}`);
  for (const line of report.errors) console.log(`  error: ${line}`);
  for (const line of report.warnings) console.log(`  warning: ${line}`);
  for (const line of report.signals) console.log(`  signal: ${line}`);
  console.log(`Done: ${report.errors.length} error(s), ${report.warnings.length} warning(s), ${report.signals.length} signal(s)`);
  process.exit(report.errors.length ? 1 : 0);
}

// When imported by the tests, only probeSpec runs; as a CLI, main() runs.
const isCli = process.argv[1] && process.argv[1].endsWith("probe.mjs");
if (isCli) main(process.argv.slice(2));
