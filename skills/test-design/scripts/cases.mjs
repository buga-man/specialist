#!/usr/bin/env node
/**
 * cases.mjs — the mechanical contract of the test-design cases artifact
 * (docs/tests/*-cases.md): the table shape, the TEST-IDs, and the coverage both
 * ways against the spec's acceptance criteria. What needs no judgment:
 *
 *   - error: a malformed TEST-ID (TEST-<TOPIC>-NNN, letters/digits/hyphens, ≥3 digits);
 *   - error: a duplicate TEST-ID — IDs are stable, never renumbered, never reused;
 *   - error: a row with a missing Type / Grader / Expected cell;
 *   - error: an unknown grader (command / stand / manual / model) or type;
 *   - error: a criterion reference no spec carries;
 *   - error: a must criterion no case exercises — the artifact's whole point;
 *   - note:   a should criterion without a case; a `—`-criterion that is not a
 *             regression case (defect-sourced rows are the only criterion-less ones).
 *
 * Usage: node cases.mjs check <cases.md> <spec.md> [more specs...]
 * Exit codes: 0 — holds, 1 — errors, 2 — usage/IO trouble.
 * Fail-safe: no cases table — exit 2 (the file is not a cases artifact); a spec
 * without an acceptance-criteria section contributes no criteria (its coverage is
 * not checked).
 */
import { readFileSync } from "node:fs";

const ID_RE = /^TEST-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3,}$/;
const GRADERS = new Set(["command", "stand", "manual", "model"]);
const TYPES = new Set([
  "main", "alternate", "exception", "boundary", "dual-mode",
  "permission", "concurrency", "state", "regression",
]);

/** The rows of a markdown table under a "## Cases" heading:
 *  { line, id, criterion, type, grader, state, expected }. */
export function parseCases(casesText) {
  const lines = String(casesText ?? "").split(/\r?\n/);
  const rows = [];
  let inCases = false;
  let header = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s+cases\b/i.test(lines[i])) {
      inCases = true;
      header = null;
      continue;
    }
    if (/^#{1,6}\s+/.test(lines[i])) {
      if (inCases) break;
      continue;
    }
    if (!inCases || !lines[i].startsWith("|")) continue;
    const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (!header) {
      header = cells.map((c) => c.replace(/\s+/g, " ").toLowerCase());
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // the separator row
    const at = (name) => {
      const idx = header.indexOf(name);
      return idx === -1 ? "" : cells[idx] ?? "";
    };
    rows.push({
      line: i + 1,
      id: at("id"),
      criterion: at("criterion"),
      type: at("type").toLowerCase(),
      grader: at("grader").toLowerCase(),
      state: at("state / input"),
      expected: at("expected"),
    });
  }
  return rows;
}

/** The numbered acceptance criteria of the given specs, merged:
 *  Map<number, { must, specs: string[] }>. Numbered rows of any
 *  "Acceptance criteria" section count — the business spec is the usual home. */
export function parseCriteria(specTexts) {
  const out = new Map();
  for (const text of specTexts) {
    const lines = String(text ?? "").split(/\r?\n/);
    let inSection = false;
    for (const line of lines) {
      if (/^#{1,6}\s+/.test(line)) {
        inSection = /acceptance criteria\b/i.test(line);
        continue;
      }
      if (!inSection) continue;
      const m = /^\s*(\d+)\.\s+(.*)$/.exec(line);
      if (!m) continue;
      const no = Number(m[1]);
      const must = /\(must\)/i.test(m[2]);
      const existing = out.get(no);
      if (existing) {
        existing.must = existing.must || must;
      } else {
        out.set(no, { must });
      }
    }
  }
  return out;
}

/** The criterion numbers a case's Criterion cell references ("1, 3" → [1, 3]). */
const criterionRefs = (cell) =>
  cell === "" || cell === "—" || cell === "-"
    ? []
    : cell.split(/[,;]\s*/).flatMap((part) => {
        const n = Number(part);
        return Number.isInteger(n) && n > 0 ? [n] : [];
      });

/**
 * The contract report: { rows, errors, notes }.
 * @param {string} casesText — the cases artifact.
 * @param {string[]} specTexts — the specs whose criteria the cases must cover.
 */
export function checkCases(casesText, specTexts) {
  const errors = [];
  const notes = [];
  const rows = parseCases(casesText);
  const criteria = parseCriteria(specTexts);

  const seen = new Map();
  const covered = new Set();
  for (const row of rows) {
    const where = `line ${row.line} (${row.id || "no id"})`;
    if (!row.id || !ID_RE.test(row.id)) {
      errors.push(`${where}: malformed TEST-ID — the shape is TEST-<TOPIC>-NNN (letters, digits, hyphens; a three-digit-or-longer number)`);
    } else if (seen.has(row.id)) {
      errors.push(`${where}: duplicate TEST-ID "${row.id}" — first seen on line ${seen.get(row.id)}; IDs are stable, retired, never reused`);
    } else {
      seen.set(row.id, row.line);
    }
    if (!row.type) errors.push(`${where}: no Type cell`);
    else if (!TYPES.has(row.type)) errors.push(`${where}: unknown type "${row.type}" — ${[...TYPES].join(" / ")}`);
    if (!row.grader) errors.push(`${where}: no Grader cell`);
    else if (!GRADERS.has(row.grader)) errors.push(`${where}: unknown grader "${row.grader}" — command / stand / manual / model`);
    if (!row.expected) errors.push(`${where}: no Expected cell — "works correctly" is not an expected value, but empty is not one either`);

    const refs = criterionRefs(row.criterion);
    if (!refs.length && row.type !== "regression") {
      notes.push(`${where}: a criterion-less case that is not a regression row — either name its criterion or mark it regression with a source`);
    }
    for (const ref of refs) {
      if (!criteria.has(ref)) errors.push(`${where}: references criterion ${ref} — no spec carries that number`);
      covered.add(ref);
    }
  }

  for (const [no, { must }] of [...criteria.entries()].sort((a, b) => a[0] - b[0])) {
    if (covered.has(no)) continue;
    if (must) errors.push(`criterion ${no} (must) is exercised by no case — the artifact's whole point`);
    else notes.push(`criterion ${no} (should) has no case — deliberate or an oversight, say which`);
  }

  return { rows, errors, notes };
}

function main(argv) {
  if (argv[0] !== "check" || argv.length < 3) {
    console.error("cases: usage: node cases.mjs check <cases.md> <spec.md> [more specs...]");
    process.exit(2);
  }
  const read = (file) => {
    try {
      return readFileSync(file, "utf8");
    } catch (error) {
      console.error(`cases: cannot read ${file}: ${error && error.message ? error.message : error}`);
      process.exit(2);
    }
  };
  const casesText = read(argv[1]);
  const specTexts = argv.slice(2).map(read);
  if (!parseCases(casesText).length) {
    console.error(`cases: no cases table under a "## Cases" heading in ${argv[1]} — not a cases artifact`);
    process.exit(2);
  }

  const report = checkCases(casesText, specTexts);
  console.log(`cases: ${argv[1]} — ${report.rows.length} case row(s), ${report.rows.filter((r) => /^TEST-/.test(r.id)).length} with TEST-IDs`);
  for (const line of report.errors) console.log(`  error: ${line}`);
  for (const line of report.notes) console.log(`  note: ${line}`);
  console.log(`Done: ${report.errors.length} error(s), ${report.notes.length} note(s)`);
  process.exit(report.errors.length ? 1 : 0);
}

// When imported by the tests, only the pure functions run; as a CLI, main() runs.
const isCli = process.argv[1] && process.argv[1].endsWith("cases.mjs");
if (isCli) main(process.argv.slice(2));
