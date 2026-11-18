/**
 * kb-fs.mjs — the file and git layer of the kb-index skill.
 *
 * Everything the pure core (kb-core.mjs) must not do: reading files, listing
 * the markdown of a project, asking git for its root, writing the generated
 * index and maps.
 *
 * The index lives in .kbindex/ of the project and is never committed. Only
 * that directory is written.
 *
 * Fail-safe: a missing file reads as an empty text, a broken index reads as
 * null, and a project without git falls back to a walk of the file system.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export { computeHash } from "./kb-core.mjs";

/** Directories that never hold documents of the corpus. */
const SKIP_DIRS = new Set([".git", "node_modules", ".kbindex", "dist", "build", "vendor", ".claude"]);

/** The directory of the generated index inside a project. */
export function indexDir(projectDir) {
  return join(projectDir, ".kbindex");
}

/** The root of the git repository the directory belongs to, or null. */
export function gitRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() || null;
}

/** Every markdown file of a project, relative and posix, sorted. */
export function listMarkdownFiles(projectDir) {
  const files = gitMarkdownFiles(projectDir);
  if (files) return files;
  return walkMarkdown(projectDir, projectDir);
}

/** The markdown files git knows about, or null when git cannot answer.
 *  `--cached` also lists files deleted from the worktree but still in the index —
 *  they are filtered out here, so a deletion never indexes as an empty document. */
function gitMarkdownFiles(projectDir) {
  if (!gitRoot(projectDir)) return null;
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { cwd: projectDir, encoding: "utf8" },
  );
  if (result.error || result.status !== 0) return null;
  return [
    ...new Set(
      result.stdout
        .split("\0")
        .filter(Boolean)
        .map((path) => path.split("\\").join("/"))
        .filter((path) => !path.split("/").some((segment) => SKIP_DIRS.has(segment)))
        .filter((path) => existsSync(join(projectDir, ...path.split("/")))),
    ),
  ].sort();
}

/** Every markdown file under a directory, skipping the service ones. Symlinks are
 *  resolved: file symlinks ending in .md count, directory symlinks are walked —
 *  with a seen-set so a cycle cannot recurse forever. */
function walkMarkdown(root, current, seen = new Set()) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true });
  } catch {
    return files;
  }
  const real = (() => {
    try {
      return realpathSync(current);
    } catch {
      return current;
    }
  })();
  if (seen.has(real)) return files; // symlink cycle — already walked
  seen.add(real);
  for (const entry of entries) {
    const path = join(current, entry.name);
    let kind = entry.isDirectory() ? "dir" : entry.isFile() && entry.name.endsWith(".md") ? "file" : null;
    if (!kind && entry.isSymbolicLink()) {
      try {
        const target = statSync(path); // follows the link
        kind = target.isDirectory() ? "dir" : target.isFile() && entry.name.endsWith(".md") ? "file" : null;
      } catch {
        kind = null; // broken symlink — skip
      }
    }
    if (kind === "dir") {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...walkMarkdown(root, path, seen));
      continue;
    }
    if (kind !== "file") continue;
    files.push(relative(root, path).split(sep).join("/"));
  }
  return files.sort();
}

/** The text of a document; a missing file reads as an empty text. */
export function readDoc(projectDir, relPath) {
  try {
    return readFileSync(join(projectDir, ...String(relPath).split("/")), "utf8");
  } catch {
    return "";
  }
}

/** The records of the index, or null when there is no usable index. */
export function readIndex(projectDir) {
  return readIndexMeta(projectDir)?.records ?? null;
}

/** The whole index artifact (records plus the build metadata), or null. */
export function readIndexMeta(projectDir) {
  try {
    const raw = readFileSync(join(indexDir(projectDir), "index.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.records)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The configuration of the index, with the defaults for what is not set. */
export function readConfig(projectDir) {
  const config = { roots: [], include: [], exclude: [], gistMaxChars: 120, bodySearch: true };
  try {
    const raw = readFileSync(join(projectDir, ".kbindex.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return config;
    for (const field of ["roots", "include", "exclude"]) {
      if (Array.isArray(parsed[field])) config[field] = parsed[field].map((item) => String(item));
    }
    if (Number.isFinite(parsed.gistMaxChars) && parsed.gistMaxChars > 0) {
      config.gistMaxChars = Math.floor(parsed.gistMaxChars);
    }
    if (typeof parsed.bodySearch === "boolean") config.bodySearch = parsed.bodySearch;
  } catch {
    /* no configuration — the defaults cover the whole project */
  }
  return config;
}

/**
 * Writes the index. The file is the public contract of the skill: other hooks
 * read it, so its shape is versioned by the "schema" field; build metadata
 * (e.g. the configuration fingerprint for incremental rebuilds) rides along
 * as extra top-level fields the contract readers ignore. Written compactly:
 * the machine contract is read by hooks at every Stop, and on a corpus of
 * thousands of documents the indentation doubles the file.
 */
export function writeIndex(projectDir, records, meta = {}) {
  const dir = indexDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const text = `${JSON.stringify({ schema: 1, ...meta, records })}\n`;
  writeFileSync(join(dir, "index.json"), text, { encoding: "utf8" });
  // The index ignores itself: nothing of it ever reaches git.
  writeFileSync(join(dir, ".gitignore"), "*\n", { encoding: "utf8" });
}

/** Writes the maps of the corpus; the maps of the previous run are removed. */
export function writeMaps(projectDir, maps) {
  const dir = join(indexDir(projectDir), "maps");
  rmSync(dir, { recursive: true, force: true });
  for (const [mapDir, content] of maps) {
    const target =
      mapDir === ""
        ? join(dir, "INDEX.md")
        : join(dir, ...mapDir.split("/"), "INDEX.md");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, { encoding: "utf8" });
  }
}

/**
 * Writes the section statistics — the derived artifact of the body search.
 * It holds no text of any document: only per-section term counts, headings
 * and lines. An empty list is written as well, so a stale artifact never
 * survives a rebuild with the body search turned off. Written compactly: on
 * a corpus of thousands of documents the indentation would double the file.
 */
export function writeSections(projectDir, docs) {
  const dir = indexDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const text = `${JSON.stringify({ schema: 1, docs })}\n`;
  writeFileSync(join(dir, "sections.json"), text, { encoding: "utf8" });
}

/** The section statistics, or null when there is no usable artifact. */
export function readSections(projectDir) {
  try {
    const raw = readFileSync(join(indexDir(projectDir), "sections.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.docs)) return null;
    return parsed;
  } catch {
    return null;
  }
}
