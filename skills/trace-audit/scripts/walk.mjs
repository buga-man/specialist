#!/usr/bin/env node
/**
 * walk.mjs — the mechanical part of the trace-audit pass: the broken promises
 * between the pipeline's artifacts that need no judgment to see:
 *
 *   - traceability: every `parent` resolves to an artifact whose `children`
 *     lists it back; every `children` entry resolves; the frontmatter `id`
 *     appears in the file's slug; `status: draft` with children or with a plan
 *     carrying closed tasks has outgrown its status;
 *   - orphan criteria: a must criterion without a `Verify:` — the same bar
 *     probe.mjs holds per spec, here walked over the whole tree at once;
 *   - the TEST-ID registry: an ID appearing in more than one cases artifact
 *     (or twice in one) is reuse — IDs are stable, retired, never reused;
 *   - stale blocking: a plan task `- Blocked by: open question #N in <spec>`
 *     whose spec's Open-questions table no longer carries #N is work waiting
 *     on nothing; a blocked-by naming a spec the tree does not carry is a
 *     dead link.
 *
 * The judgment checks of the skill (findings that never closed, the untriaged
 * queue, implementation without review) stay with the agent — this script
 * quotes, it does not judge.
 *
 * Usage: node walk.mjs [docs-root]        (default: docs)
 * Exit codes: 0 — clean or nothing to check, 1 — findings, 2 — usage/IO.
 * Silence is a finding's absence, never evidence of health: an empty or
 * missing directory is reported as "nothing to check", not as "passed".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The criteria-section heading, bilingual: the team's working language may be
 *  either. Cyrillic branches are prefix stems, not \b-bounded words — JS \b is
 *  ASCII-only and never fires around Cyrillic letters. */
const CRITERIA_HEADING_RE =
  /^#{1,6}\s*(?:\d+[.\s]*)?\s*(?:acceptance criteria\b|критери[а-яё]*\s+при[ёе]мк|при[ёе]мочн[а-яё]*\s+критери[а-яё]*)/i;

/** The open-questions heading, bilingual for the same reason. */
const OPEN_QUESTIONS_HEADING_RE =
  /^#{1,6}\s*(?:\d+[.\s]*)?\s*(?:open questions\b|открыт[а-яё]*\s+вопрос|нереш[её]н)/i;

const TEST_ID_RE = /\bTEST-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3,}\b/g;
const BLOCKED_BY_RE = /^(\s*-\s*Blocked by:\s*open question #(\d+) in (.+?)\s*)$/;

/** Minimal frontmatter: only the traceability fields, inline children
 *  (`children: [a, b]`) and the YAML list form both parsed. */
export function parseFrontmatter(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  if (lines[0] !== "---") return {};
  const out = {};
  let children = null;
  for (let i = 1; i < lines.length && lines[i] !== "---"; i++) {
    const inline = /^children:\s*\[(.*)\]\s*$/.exec(lines[i]);
    if (inline) {
      children = inline[1].split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    if (/^children:\s*$/.test(lines[i])) {
      children = [];
      continue;
    }
    if (children !== null && /^\s+-\s+\S/.test(lines[i])) {
      children.push(lines[i].replace(/^\s+-\s+/, "").trim());
      continue;
    }
    const kv = /^([a-z-]+):\s*(.+)$/.exec(lines[i]);
    if (kv && kv[1] !== "children") out[kv[1]] = kv[2].trim();
  }
  if (children !== null) out.children = children;
  return out;
}

/** The section body under the first heading matching `re`, as lines. */
const sectionLines = (lines, re) => {
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,6}\s+/.test(l));
  return lines.slice(start + 1, end === -1 ? lines.length : end);
};

/** The numbers of a spec's open questions: the `| N | …` rows of the
 *  Open-questions table. `null` — no such section in this artifact. */
export function openQuestionNumbers(text) {
  const section = sectionLines(String(text ?? "").split(/\r?\n/), OPEN_QUESTIONS_HEADING_RE);
  if (section === null) return null;
  const numbers = [];
  for (const line of section) {
    if (!line.trimStart().startsWith("|")) continue;
    const first = line.split("|")[1]?.trim();
    if (/^\d+$/.test(first ?? "")) numbers.push(Number(first));
  }
  return numbers;
}

/** Every must criterion of `text` without a `Verify:` — { file, no } rows. */
export function mustsWithoutVerify(text) {
  const section = sectionLines(String(text ?? "").split(/\r?\n/), CRITERIA_HEADING_RE);
  if (section === null) return [];
  const out = [];
  section.forEach((raw, idx) => {
    const m = /^\s*(\d+)\.\s+(.*)$/.exec(raw);
    if (!m) return;
    if (/\(must\)/i.test(m[2]) && !/\bverify\s*:/i.test(m[2])) out.push(Number(m[1]) || idx + 1);
  });
  return out;
}

const base = (name) => name.split(/[\\/]/).pop().replace(/\.md$/, "");

/**
 * The walk over the artifact tree. Pure — reads nothing; the CLI owns the files.
 * @param {{specs: {name: string, text: string}[], plans: {name: string, text: string}[], tests: {name: string, text: string}[]}} docs
 * @returns {{findings: {location: string, check: string, finding: string}[], artifacts: number}}
 */
export function auditArtifacts(docs) {
  const findings = [];
  const say = (location, check, finding) => findings.push({ location, check, finding });

  const chain = [...docs.specs, ...docs.plans]
    .map((f) => ({ ...f, fm: parseFrontmatter(f.text) }))
    .filter((f) => f.fm.id);
  const byId = new Map(chain.map((f) => [f.fm.id, f]));

  for (const file of chain) {
    const { id, parent, children, status } = file.fm;
    if (!base(file.name).includes(id)) {
      say(file.name, "traceability", `frontmatter id "${id}" is absent from the file's slug — id and file name disagree`);
    }
    if (parent) {
      const upstream = byId.get(parent);
      if (!upstream) {
        say(file.name, "traceability", `parent "${parent}" resolves to no artifact in the tree`);
      } else if (!(upstream.fm.children ?? []).includes(id)) {
        say(upstream.name, "traceability", `children does not list "${id}" — a one-way link (${file.name} points up, nothing points back)`);
      }
    }
    for (const child of children ?? []) {
      if (!byId.has(child)) say(file.name, "traceability", `children entry "${child}" resolves to no artifact — a dead link`);
    }
    if (status === "draft") {
      if ((children ?? []).length > 0) {
        say(file.name, "status honesty", `status draft with ${children.length} child artifact(s) — the artifact outgrew its status`);
      }
      const done = docs.plans.find((p) => base(p.name).includes(id) && /^-\s*Done:/m.test(p.text));
      if (done) {
        say(file.name, "status honesty", `status draft while ${done.name} carries closed tasks — the artifact outgrew its status`);
      }
    }
  }

  for (const spec of docs.specs) {
    for (const no of mustsWithoutVerify(spec.text)) {
      say(spec.name, "orphan criteria", `criterion ${no} (must) has no Verify — it can never produce an evidence-backed verdict`);
    }
  }

  const registry = new Map();
  for (const file of docs.tests) {
    const ids = String(file.text).match(TEST_ID_RE) ?? [];
    for (const id of ids) {
      if (registry.has(id) && registry.get(id) !== file.name) {
        say(file.name, "test-id registry", `TEST-ID ${id} also appears in ${registry.get(id)} — IDs are stable, retired, never reused`);
      } else if (registry.has(id)) {
        say(file.name, "test-id registry", `TEST-ID ${id} appears twice in this artifact — one of the two is drift`);
      } else {
        registry.set(id, file.name);
      }
    }
  }

  for (const plan of docs.plans) {
    for (const line of String(plan.text).split(/\r?\n/)) {
      const m = BLOCKED_BY_RE.exec(line);
      if (!m) continue;
      const [no, ref] = [Number(m[2]), m[3]];
      const spec = docs.specs.find((s) => [base(s.name), s.name].includes(ref.replace(/\.md$/, "")));
      if (!spec) {
        say(plan.name, "stale blocking", `"${line.trim()}" names a spec the tree does not carry — a dead link`);
        continue;
      }
      const open = openQuestionNumbers(spec.text);
      if (open !== null && !open.includes(no)) {
        say(plan.name, "stale blocking", `blocked on open question #${no} in ${spec.name}, but its table no longer carries #${no} — work waiting on nothing`);
      }
    }
  }

  return { findings, artifacts: docs.specs.length + docs.plans.length + docs.tests.length };
}

/** Every *.md under `dir`, recursively, as relative names; [] when absent. */
function collect(dir) {
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".md")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function main(argv) {
  const root = argv[0] ?? "docs";
  const load = (sub) => collect(join(root, sub))
    .map((path) => ({ name: path.split(/[\\/]/).slice(-2).join("/"), text: readFileSync(path, "utf8") }));
  let docs;
  try {
    docs = { specs: load("specs"), plans: load("plans"), tests: load("tests") };
  } catch (error) {
    console.error(`walk: cannot read under ${root}: ${error && error.message ? error.message : error}`);
    process.exit(2);
  }

  if (docs.specs.length + docs.plans.length + docs.tests.length === 0) {
    console.log(`walk: no specs, plans, or cases artifacts under ${root} — nothing to check`);
    process.exit(0);
  }
  for (const [label, files] of [["specs", docs.specs], ["plans", docs.plans], ["cases artifacts", docs.tests]]) {
    if (!files.length) console.log(`walk: no ${label} under ${root} — nothing to check there`);
  }

  const { findings, artifacts } = auditArtifacts(docs);
  console.log(`walk: ${artifacts} artifact(s) under ${root}`);
  for (const f of findings) console.log(`  ${f.location} | ${f.check}: ${f.finding}`);
  console.log(`Done: ${findings.length} finding(s)`);
  process.exit(findings.length ? 1 : 0);
}

// When imported by the tests, only the pure functions run; as a CLI, main() runs.
const isCli = process.argv[1] && process.argv[1].endsWith("walk.mjs");
if (isCli) main(process.argv.slice(2));
