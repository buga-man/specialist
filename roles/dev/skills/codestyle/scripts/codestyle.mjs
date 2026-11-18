#!/usr/bin/env node
/**
 * codestyle.mjs — the codestyle skill CLI: the single source of truth on CODESTYLE.md
 * freshness (status) and on the repo's agent-readability file sizes (scan).
 *
 * Usage:
 *   node codestyle.mjs status [--project <dir>]
 *   node codestyle.mjs scan   [--project <dir>]
 *   node codestyle.mjs help
 *
 * `status` prints the freshness verdict as one-line JSON:
 *   {"doc":"ok","stale":false,"codeCommits":5,"days":3,"base":"a1b2c3d…","generated":"2026-11-10"}
 *   {"doc":"missing"}                       — no CODESTYLE.md in the project root;
 *   {"doc":"broken"}                        — the frontmatter is missing or broken;
 *   {"doc":"ok","git":false,…}              — git could not answer, freshness unknown.
 * The verify mode of the codestyle skill relies on the same verdict — the freshness
 * formula lives only in lib/codestyle-core.mjs, not in the instruction prose.
 *
 * `scan` prints the agent-readability facts as one-line JSON:
 *   {"files":42,"largest":{"file":"src/big.mjs","lines":610},"oversized":[…],"limit":500}
 * The generate/verify modes cite these numbers as the evidence for the document's
 * section 10 (Agent readability) — the measurement lives here, not in the prose.
 *
 * Exit codes: 0 — a verdict was produced (including "no document"); 2 — invocation error.
 * Dependencies: only Node and git.
 */
import process from "node:process";
import {
  countCodeCommits,
  daysSince,
  freshness,
  parseFrontmatter,
  parseGitLog,
  readabilityFacts,
  todayISO,
} from "./lib/codestyle-core.mjs";
import { gitCommitsSince, gitRoot, readCodestyleDoc, walkCodeFiles } from "./lib/codestyle-fs.mjs";

export function parseArgs(argv) {
  const args = { _: [], project: null, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project") {
      const value = argv[++i];
      if (!value) args.error = "--project needs a directory";
      else args.project = value;
    } else if (arg === "-h" || arg === "--help") args.help = true;
    else args._.push(arg);
  }
  return args;
}

function out(text) {
  process.stdout.write(Buffer.from(text, "utf8"));
}

function note(text) {
  process.stderr.write(Buffer.from(text, "utf8"));
}

function verdictJson(verdict) {
  return JSON.stringify(verdict) + "\n";
}

const USAGE =
  "Usage: node codestyle.mjs <status|scan> [--project <dir>]\n" +
  "status — the freshness verdict for CODESTYLE.md as a one-line JSON.\n" +
  "scan   — the agent-readability facts (code file sizes) as a one-line JSON.";

const args = parseArgs(process.argv.slice(2));
if (args.error) {
  note(`codestyle: ${args.error}\n${USAGE}\n`);
  process.exit(2);
}
if (args.help || args._[0] === "help") {
  out(USAGE + "\n");
  process.exit(0);
}
const command = args._[0];
if ((command !== "status" && command !== "scan") || args._.length > 1) {
  note(`codestyle: unknown command${command ? ` "${command}"` : " (empty)"}\n${USAGE}\n`);
  process.exit(2);
}

// An explicit --project wins; without it — the git root from the current directory:
// the hook reminder offers the command without --project, so it must work from a subdirectory.
const projectDir = args.project || gitRoot(process.cwd()) || process.cwd();

if (command === "scan") {
  try {
    out(verdictJson(readabilityFacts(walkCodeFiles(projectDir))));
    process.exit(0);
  } catch (error) {
    note(`codestyle: ${error?.message ?? error}\n`);
    process.exit(2);
  }
}

try {
  const text = readCodestyleDoc(projectDir);
  if (text === null) {
    out(verdictJson({ doc: "missing" }));
    process.exit(0);
  }
  const doc = parseFrontmatter(text);
  if (!doc) {
    out(verdictJson({ doc: "broken" }));
    process.exit(0);
  }
  const log = gitCommitsSince(projectDir, doc.base);
  if (log === null) {
    out(verdictJson({ doc: "ok", git: false, stale: false, codeCommits: null, days: daysSince(doc.generated, todayISO(new Date())), base: doc.base, generated: doc.generated }));
    process.exit(0);
  }
  const verdict = freshness({
    base: doc.base,
    generated: doc.generated,
    codeCommits: countCodeCommits(parseGitLog(log)),
    today: todayISO(new Date()),
  });
  out(verdictJson(verdict));
} catch (error) {
  note(`codestyle: ${error?.message ?? error}\n`);
  process.exit(2);
}
