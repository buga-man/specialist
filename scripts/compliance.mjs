#!/usr/bin/env node
/**
 * compliance.mjs — the repository's self-audit: the plugin holds itself to the same
 * rigor its skills demand of target repositories.
 *
 * Checks:
 *   1. every skills/<name>/SKILL.md frontmatter — a strict YAML subset. Strictness is not
 *      pedantry: hosts (pi at least) parse the description with a real YAML parser, and
 *      a plain scalar with ": " inside is exactly the bug class that broke skill
 *      loading before (commit 86be51f). Also: name == directory (kebab-case, ≤64),
 *      description 1–1024 chars.
 *   2. Portability of SKILL.md bodies: no host variables (${…}), no machine-specific
 *      absolute paths, no leftover skill-template checklist comments.
 *   3. Docs parity: every skill is backticked in README and has a section in
 *      docs/skills.md; every hook adapter registered in hooks/hooks*.json is named in
 *      docs/hooks.md; every pi extension too. Documentation that drifted from the tree
 *      is the defect class the pipeline's own tech-writer flags in target repos.
 *   4. docs/skill-index.md — generated from the frontmatter (the catalog of what the
 *      hosts actually autoload). --fix rebuilds it; hand edits get overwritten.
 *
 * Version sync across the host manifests is enforced by hooks/lib/hooks-manifest.test.mjs
 * (npm test) and deliberately not duplicated here.
 *
 * Exit codes: 0 — compliant, 1 — findings, 2 — usage error. --fix regenerates the
 * derived artifacts (currently only docs/skill-index.md).
 *
 * Run: node scripts/compliance.mjs [--fix]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url)); // this file sits in <root>/scripts/

const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

/** Strict subset of YAML for skill frontmatter: `key: value` lines, quoted or plain
 *  scalars, full-line comments. Everything a real YAML parser would accept but a skill
 *  frontmatter should not rely on (block scalars, anchors, multi-line flows) is an
 *  error here — the frontmatter must stay trivially parsable by every host.
 *  Never throws: returns { data, errors } — "I know nothing" on a broken block. */
export function parseFrontmatterStrict(text) {
  const data = {};
  const errors = [];
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") {
    return { data, errors: ["frontmatter must open with a --- line"] };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { data, errors: ["frontmatter is never closed with a --- line"] };
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    if (raw.includes("\t")) errors.push(`line ${i + 1}: tab character — spaces only`);
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:[ ](.*))?$/);
    if (!m) {
      errors.push(`line ${i + 1}: not a "key: value" pair — ${JSON.stringify(line)}`);
      continue;
    }
    const key = m[1];
    if (key in data) errors.push(`line ${i + 1}: duplicate key "${key}"`);
    let value = (m[2] ?? "").trim();
    const doubleQuoted = /^"(.*)"$/s.test(value);
    const singleQuoted = /^'(.*)'$/s.test(value);
    if (doubleQuoted || singleQuoted) {
      const inner = value.slice(1, -1);
      // Unescape what a real YAML parser unescapes, so the derived catalog shows what
      // the hosts actually autoload (the kb-index description carries \"). The strict
      // subset knows no other escapes — anything else stays literal.
      value = doubleQuoted
        ? inner.replace(/\\(["\\])/g, "$1")
        : inner.replace(/''/g, "'");
    } else if (value) {
      if (value.includes(": ")) {
        errors.push(
          `line ${i + 1}: plain scalar "${key}" contains ": " — a strict YAML parser reads ` +
            `that as a mapping and rejects the frontmatter; quote the value or rephrase`,
        );
      }
      const hashAt = value.search(/\s#/);
      if (hashAt !== -1) {
        errors.push(
          `line ${i + 1}: plain scalar "${key}" contains " #" — YAML reads the rest as a ` +
            `comment and silently truncates the value; quote the value or drop it`,
        );
      }
    }
    data[key] = value;
  }
  return { data, errors };
}

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const TEMPLATE_MARKER = "Checklist for adding a new skill";

/** Findings for one SKILL.md: frontmatter shape, the name/description limits from the
 *  skill template, and the portability rules from README ("How to add a skill"). */
export function validateSkill(dirName, text) {
  const findings = [];
  const { data, errors } = parseFrontmatterStrict(text);
  for (const e of errors) findings.push(`${dirName}: ${e}`);

  const name = data.name ?? "";
  if (!name) findings.push(`${dirName}: frontmatter has no "name"`);
  if (name && name !== dirName) findings.push(`${dirName}: name "${name}" != directory name`);
  if (name && !NAME_RE.test(name)) findings.push(`${dirName}: name "${name}" is not kebab-case`);
  if (name.length > MAX_NAME) findings.push(`${dirName}: name longer than ${MAX_NAME} chars`);

  const description = data.description ?? "";
  if (!description) findings.push(`${dirName}: frontmatter has no "description"`);
  if (description.length > MAX_DESCRIPTION) {
    findings.push(
      `${dirName}: description is ${description.length} chars — the limit is ${MAX_DESCRIPTION}`,
    );
  }

  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
  if (body.includes("${CLAUDE")) {
    findings.push(`${dirName}: SKILL.md contains \${CLAUDE…} — host variables are forbidden there`);
  }
  for (const [re, what] of [
    // The lookbehind keeps URLs out ("https://" has a letter before the colon); a drive
    // letter starts a path token, not an identifier.
    [/(?<![A-Za-z])[A-Za-z]:[\\/]/, "a Windows absolute path"],
    [/\/Users\//, "a machine-specific /Users/ path"],
    [/\/home\//, "a machine-specific /home/ path"],
  ]) {
    if (re.test(body)) findings.push(`${dirName}: SKILL.md contains ${what}`);
  }
  if (text.includes(TEMPLATE_MARKER)) {
    findings.push(`${dirName}: the skill-template checklist comment was not deleted`);
  }
  return findings;
}

/** The generated catalog: one row per skill, the description the hosts autoload.
 *  Pipe characters are escaped so a description cannot break the table. */
export function buildCatalog(skills) {
  const rows = [...skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (s) =>
        `| [${s.name}](../skills/${s.name}/SKILL.md) | ${s.description.replace(/\|/g, "\\|")} |`,
    )
    .join("\n");
  return [
    "# Skill index",
    "",
    "Generated from the skills' `SKILL.md` frontmatter — the exact descriptions the hosts",
    "autoload into context. Rebuild with `node scripts/compliance.mjs --fix`; the source of",
    "truth is the frontmatter, and hand edits here are overwritten on the next run.",
    "The human-readable tour of the same skills — [docs/skills.md](skills.md).",
    "",
    "| Skill | Description (the autoload trigger) |",
    "|---|---|",
    rows,
    "",
  ].join("\n");
}

function skillNames() {
  const root = join(REPO_ROOT, "skills");
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

/** Hook adapter basenames registered in both host manifests. */
function registeredAdapters() {
  const names = new Set();
  for (const file of ["hooks/hooks.json", "hooks/hooks-codex.json"]) {
    const manifest = JSON.parse(read(file));
    for (const groups of Object.values(manifest.hooks ?? {})) {
      for (const group of groups) {
        for (const h of group.hooks ?? []) {
          const m = String(h.command ?? "").match(/hooks\/lib\/([a-z0-9-]+\.mjs)/);
          if (m) names.add(m[1]);
        }
      }
    }
  }
  return [...names].sort();
}

function piExtensions() {
  const root = join(REPO_ROOT, "extensions");
  return readdirSync(root)
    .filter((f) => f.endsWith(".ts"))
    .sort();
}

function main() {
  const fix = process.argv.includes("--fix");
  if (process.argv.slice(2).some((a) => !a.startsWith("--"))) {
    process.stdout.write(
      "usage: node scripts/compliance.mjs [--fix]\n  --fix  regenerate the derived artifacts (docs/skill-index.md)\n",
    );
    process.exit(2);
  }

  const findings = [];

  const names = skillNames();
  const infos = [];
  for (const name of names) {
    const text = read(join("skills", name, "SKILL.md"));
    findings.push(...validateSkill(name, text));
    infos.push({ name, description: parseFrontmatterStrict(text).data.description ?? "" });
  }

  // Directory and file names go into regexes below; a name with regex metacharacters
  // must match literally, not bend the pattern.
  const headingRe = (word) =>
    new RegExp(`^## ${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m");

  const readme = read("README.md");
  const skillsDoc = read("docs/skills.md");
  for (const name of names) {
    if (!readme.includes(`\`${name}\``)) findings.push(`README.md: skill "${name}" is not mentioned`);
    if (!headingRe(name).test(skillsDoc)) {
      findings.push(`docs/skills.md: no "## ${name}" section`);
    }
  }

  // docs/hooks.md documents hooks by name ("## <hook> — ..."), not by adapter file; the
  // adapter file ↔ registration wiring is hooks-manifest.test.mjs's job. Deriving the
  // hook name from the adapter filename (strip -codex / extension) keeps both contracts.
  const hooksDoc = read("docs/hooks.md");
  const hookNames = (files) =>
    [...new Set(files.map((f) => f.replace(/-codex\.(?:mjs|ts)$/, "").replace(/\.(?:mjs|ts)$/, "")))].sort();
  for (const hook of hookNames(registeredAdapters())) {
    if (!headingRe(hook).test(hooksDoc)) {
      findings.push(`docs/hooks.md: no "## ${hook}" section for a registered hook`);
    }
  }
  for (const hook of hookNames(piExtensions())) {
    if (!headingRe(hook).test(hooksDoc)) {
      findings.push(`docs/hooks.md: no "## ${hook}" section for a pi extension`);
    }
  }

  const catalogRel = join("docs", "skill-index.md");
  const catalog = buildCatalog(infos);
  // Compare newline-insensitively: git's autocrlf rewrites the checked-out file to CRLF
  // on Windows, and the generated text is LF — the content, not the line endings, is
  // the contract.
  const current = existsSync(join(REPO_ROOT, catalogRel))
    ? read(catalogRel).replace(/\r\n/g, "\n")
    : "";
  if (current !== catalog) {
    if (fix) {
      writeFileSync(join(REPO_ROOT, catalogRel), Buffer.from(catalog, "utf8"));
      console.log(`rebuilt ${catalogRel} (${names.length} skills)`);
    } else {
      findings.push(
        "docs/skill-index.md is stale — rebuild with: node scripts/compliance.mjs --fix",
      );
    }
  }

  if (findings.length) {
    const out = findings.map((f) => `- ${f}`).join("\n") + `\n${findings.length} finding(s)\n`;
    process.stdout.write(out);
    process.exit(1);
  }
  console.log(`compliance: ${names.length} skills, docs parity, catalog — all checks pass`);
}

// The script runs both as a CLI and as an import in tests — main() only when executed.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (e) {
    console.error(String(e));
    process.exit(1);
  }
}
