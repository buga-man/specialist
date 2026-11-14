#!/usr/bin/env node
/**
 * kb.mjs — the kb-index skill CLI: the index and the directory maps over a project's documentation.
 *
 * Usage:
 *   node kb.mjs build   [--project <dir>]
 *   node kb.mjs search  <query> [--project <dir>] [--limit <n>]
 *   node kb.mjs map     <dir> [--project <dir>]
 *   node kb.mjs related <path|id> [--project <dir>]
 *   node kb.mjs path    <path|id> <path|id> [--project <dir>]
 *   node kb.mjs audit   [--project <dir>]
 *   node kb.mjs clean   [--project <dir>]
 *
 * The index lives in <project>/.kbindex/ and is not versioned:
 *   index.json             — the contract { "schema": 1, "records": [...] };
 *   sections.json          — per-section term statistics for the body search;
 *   maps/<dir>/INDEX.md    — the directory maps ("" — the root, maps/INDEX.md).
 * The search is two-tier: first over the document's "face" (id, title, gist,
 * anchor, path), then over the body — BM25 over sections. search, map, related
 * and path build the index themselves when it is absent.
 *
 * Exit codes: 0 — success; 1 — error (no map, directory not found); 2 — invocation error.
 * Dependencies: only Node (no npm packages).
 */
import { readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import {
  buildGraph,
  buildMaps,
  buildRecord,
  buildSections,
  cut,
  isExcluded,
  relatedOf,
  RELATION_FIELDS,
  resolveRefs,
  resolveTarget,
  searchIndex,
  searchWithBody,
  selectPaths,
  shortestPath,
} from "./lib/kb-core.mjs";
import {
  indexDir,
  listMarkdownFiles,
  readConfig,
  readDoc,
  readIndex,
  readSections,
  writeIndex,
  writeMaps,
  writeSections,
} from "./lib/kb-fs.mjs";

/** The frontmatter fields that hold relations between documents. */
const REF_KEYS = RELATION_FIELDS;

/** A gist that starts with one of these is service text, not an essence. */
const BOILERPLATE = ["status:", "date:", "owner:", "source:", "slug:", "role:", "key:"];

/** A gist shorter than this is counted apart. */
const SHORT_GIST = 40;

export function parseArgs(argv) {
  const args = { _: [], project: process.cwd(), limit: 20, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project") {
      const value = argv[++i];
      if (!value) args.error = "--project needs a directory";
      else args.project = value;
    } else if (arg === "--limit") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) args.error = "--limit needs a positive number";
      else args.limit = Math.floor(value);
    } else if (arg === "-h" || arg === "--help") args.help = true;
    else args._.push(arg);
  }
  return args;
}

/** Writes to stdout as UTF-8, whatever the console encoding is. */
function out(text) {
  process.stdout.write(Buffer.from(text, "utf8"));
}

/** Writes to stderr as UTF-8. */
function note(text) {
  process.stderr.write(Buffer.from(text, "utf8"));
}

/** The directory of a path; "" for the project root. */
function dirOf(path) {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/** The modification time of a file, 0 when it cannot be read. */
function mtimeOf(projectDir, relPath) {
  try {
    return statSync(join(projectDir, ...relPath.split("/"))).mtimeMs;
  } catch {
    return 0;
  }
}

/** Builds the index, the maps and the section statistics of a project in memory. */
function buildIndex(projectDir) {
  const config = readConfig(projectDir);
  const files = selectPaths(listMarkdownFiles(projectDir), config);
  const knownPaths = new Set(files);
  const records = [];
  const sections = [];
  let sectionCount = 0;

  for (const path of files) {
    const content = readDoc(projectDir, path);
    const excluded = isExcluded(path, config);
    records.push(
      buildRecord({
        path,
        content,
        knownPaths,
        mtime: mtimeOf(projectDir, path),
        excluded,
      }),
    );
    if (config.bodySearch && !excluded) {
      const entry = buildSections(path, content);
      if (entry) {
        sections.push(entry);
        sectionCount += entry.sections.length;
      }
    }
  }

  const refs = resolveRefs(records, REF_KEYS);
  for (const record of records) record.refs = refs.refs[record.path] || [];

  const dirs = new Set(records.map((record) => dirOf(record.path))).size;
  return { records, maps: buildMaps(records, config.gistMaxChars), refs, dirs, sections, sectionCount };
}

/** Which kind of gist a document has. */
function gistKind(gist) {
  if (!gist) return "empty";
  const plain = gist
    .toLowerCase()
    .replace(/\*/g, "")
    .trim()
    .replace(/^[-+•]\s*/, "")
    .trim();
  if (BOILERPLATE.some((marker) => plain.startsWith(marker))) return "boilerplate";
  if (gist.length < SHORT_GIST) return "short";
  return "usable";
}

/** The report of a build. */
function buildReport({ records, refs, dirs, sectionCount }) {
  const kinds = { usable: 0, empty: 0, boilerplate: 0, short: 0 };
  const ids = new Map();
  let withAnchor = 0;

  for (const record of records) {
    kinds[gistKind(record.gist)]++;
    if (record.anchor) withAnchor++;
    if (record.id) ids.set(record.id, (ids.get(record.id) || 0) + 1);
  }

  const duplicated = [...ids.values()].filter((count) => count > 1).length;

  return [
    `kb-index: ${records.length} documents, ${dirs} directories`,
    `gist: ${kinds.usable} usable, ${kinds.empty} empty, ${kinds.boilerplate} boilerplate, ${kinds.short} short`,
    `anchor: ${withAnchor} with anchor, ${records.length - withAnchor} without`,
    `id: ${ids.size} unique, ${duplicated} duplicated`,
    `refs: ${refs.resolved} resolved, ${refs.ambiguous} ambiguous, ${refs.freeText} free text`,
    `sections: ${sectionCount} (body search)`,
  ].join("\n");
}

/** The path of a map inside the index directory. */
function mapPath(projectDir, dir) {
  return dir === "" ? join(indexDir(projectDir), "maps", "INDEX.md") : join(indexDir(projectDir), "maps", ...dir.split("/"), "INDEX.md");
}

/** The nearest ancestor of a directory that has a map, or null. */
function nearestMap(projectDir, dir) {
  let current = dir;
  for (;;) {
    try {
      const content = readFileSync(mapPath(projectDir, current), "utf8");
      if (content) return { dir: current, content };
    } catch {
      /* no map here */
    }
    if (current === "") return null;
    current = dirOf(current);
  }
}

function cmdBuild(projectDir) {
  const built = buildIndex(projectDir);
  writeIndex(projectDir, built.records);
  writeMaps(projectDir, built.maps);
  writeSections(projectDir, built.sections);
  out(`${buildReport(built)}\n`);
}

function cmdSearch(projectDir, query, limit) {
  const records = recordsOf(projectDir);

  const { face, body } = searchWithBody(records, readSections(projectDir), query);
  const hits = [...face, ...body];
  if (!hits.length) {
    out("kb-index: no matches\n");
    return;
  }
  const lines = [];
  for (const hit of hits.slice(0, limit)) {
    const anchor =
      hit.anchor && hit.anchor.heading ? `§${hit.anchor.heading}:${hit.anchor.line}` : "";
    lines.push(`${hit.id}  ${hit.path}${anchor ? `  ${anchor}` : ""}`);
    if (hit.gist) lines.push(`       ${cut(hit.gist, 200)}`);
  }
  out(`${lines.join("\n")}\n`);
}

function cmdMap(projectDir, dir) {
  const target = dir.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  recordsOf(projectDir);

  const found = nearestMap(projectDir, target);
  if (!found) {
    note(`kb-index: no map for ${target || "."} and no map in its parents\n`);
    process.exit(1);
  }
  if (found.dir !== target) note(`kb-index: no map for ${target || "."}, showing ${found.dir || "."}\n`);
  out(found.content);
}

/** Builds the index when it is absent; returns the records. */
function recordsOf(projectDir) {
  let records = readIndex(projectDir);
  if (!records) {
    const built = buildIndex(projectDir);
    writeIndex(projectDir, built.records);
    writeMaps(projectDir, built.maps);
    writeSections(projectDir, built.sections);
    records = built.records;
  }
  return records;
}

/** Resolves a CLI argument to a document or exits with a message. */
function targetOf(records, arg) {
  const resolved = resolveTarget(records, arg);
  if (resolved.path) return resolved.path;
  if (resolved.error === "ambiguous") {
    note(`kb-index: "${resolved.value}" matches several documents:\n`);
    for (const candidate of resolved.candidates) note(`  ${candidate}\n`);
  } else {
    note(`kb-index: no document for "${resolved.value}"\n`);
  }
  process.exit(1);
}

/** The label of a neighbor line: the title when there is one, else nothing. */
function neighborLabel(record) {
  if (!record) return "";
  const name = record.title || record.id;
  return name ? ` — ${name}` : "";
}

function cmdRelated(projectDir, arg) {
  const records = recordsOf(projectDir);
  const path = targetOf(records, arg);
  const record = records.find((entry) => entry.path === path);
  const graph = buildGraph(records);
  const neighbors = relatedOf(path, graph);

  const head = record && (record.title || record.id) ? `${record.title || record.id}  (${path})` : path;
  const lines = [head];
  for (const neighbor of neighbors.slice(0, 30)) {
    const other = graph.byPath.get(neighbor.path);
    for (const relation of neighbor.relations) {
      const arrow = relation.dir === "out" ? "→" : "←";
      lines.push(`  ${arrow} ${relation.key}: ${neighbor.path}${neighborLabel(other)}`);
    }
  }
  if (lines.length === 1) lines.push("  (no related documents)");
  out(`${lines.join("\n")}\n`);
}

function cmdPath(projectDir, argA, argB) {
  const records = recordsOf(projectDir);
  const from = targetOf(records, argA);
  const to = targetOf(records, argB);
  if (from === to) {
    note("kb-index: both arguments point at the same document\n");
    process.exit(2);
  }

  const steps = shortestPath(from, to, buildGraph(records));
  if (!steps) {
    note(`kb-index: no chain of documents between ${from} and ${to}\n`);
    process.exit(1);
  }

  const lines = [from];
  for (const step of steps) {
    const arrow = step.edge.from === step.from ? "→" : "←";
    lines.push(`  ${arrow} ${step.edge.key} ${arrow} ${step.to}`);
  }
  lines.push(`${steps.length} hop${steps.length === 1 ? "" : "s"}`);
  out(`${lines.join("\n")}\n`);
}

function cmdAudit(projectDir) {
  const { records, refs } = buildIndex(projectDir);
  const ids = new Map();
  for (const record of records) {
    if (!record.id) continue;
    if (!ids.has(record.id)) ids.set(record.id, []);
    ids.get(record.id).push(record.path);
  }

  const lines = ["kb-index audit"];
  const duplicates = [...ids.entries()].filter(([, paths]) => paths.length > 1);
  lines.push(`duplicate ids: ${duplicates.length}`);
  for (const [id, paths] of duplicates) {
    lines.push(`  ${id}`);
    for (const path of paths) lines.push(`    ${path}`);
  }

  const ambiguous = Object.entries(refs.refs).flatMap(([path, list]) =>
    list.filter((ref) => ref.resolved === null).map((ref) => ({ path, ref })),
  );
  lines.push(`ambiguous refs: ${ambiguous.length}`);
  for (const { path, ref } of ambiguous) {
    lines.push(`  ${path} — ${ref.key}: ${ref.value} → ${ref.candidates.join(", ")}`);
  }

  const noGist = records.filter((record) => !record.gist);
  const noAnchor = records.filter((record) => !record.anchor);
  lines.push(`documents without gist: ${noGist.length}`);
  for (const record of noGist.slice(0, 20)) lines.push(`  ${record.path}`);
  lines.push(`documents without anchor: ${noAnchor.length}`);
  for (const record of noAnchor.slice(0, 20)) lines.push(`  ${record.path}`);

  out(`${lines.join("\n")}\n`);
}

function cmdClean(projectDir) {
  rmSync(indexDir(projectDir), { recursive: true, force: true });
  out("kb-index: .kbindex removed\n");
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    note(`kb-index: ${args.error}\n`);
    process.exit(2);
  }
  const command = args._[0];

  if (args.help || !command) {
    note(
      [
        "usage: kb.mjs build|search|map|related|path|audit|clean [--project <dir>] [--limit <n>]",
        "  build              — rebuild the index, the sections and the maps, print the report",
        "  search <query>     — find documents by their face, then by their body sections",
        "  map <dir>          — print the map of a directory",
        "  related <path|id>  — the documents linked to and from one document",
        "  path <a> <b>       — the shortest chain of documents between two documents",
        "  audit              — report on the quality of the data",
        "  clean              — remove .kbindex",
      ].join("\n") + "\n",
    );
    process.exit(command ? 0 : 2);
  }

  switch (command) {
    case "build":
      cmdBuild(args.project);
      break;
    case "search": {
      const query = args._.slice(1).join(" ").trim();
      if (!query) {
        note("kb-index: search needs a query\n");
        process.exit(2);
      }
      cmdSearch(args.project, query, args.limit);
      break;
    }
    case "map": {
      const dir = args._[1];
      if (!dir) {
        note("kb-index: map needs a directory\n");
        process.exit(2);
      }
      cmdMap(args.project, dir);
      break;
    }
    case "related": {
      const target = args._[1];
      if (!target) {
        note("kb-index: related needs a document path or an id\n");
        process.exit(2);
      }
      cmdRelated(args.project, target);
      break;
    }
    case "path": {
      const [a, b] = args._.slice(1);
      if (!a || !b) {
        note("kb-index: path needs two documents (paths or ids)\n");
        process.exit(2);
      }
      cmdPath(args.project, a, b);
      break;
    }
    case "audit":
      cmdAudit(args.project);
      break;
    case "clean":
      cmdClean(args.project);
      break;
    default:
      note(`kb-index: unknown command "${command}"\n`);
      process.exit(2);
  }
}

main(process.argv.slice(2));
