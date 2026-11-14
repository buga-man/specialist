/**
 * kb-gate-core.mjs — the kb-index staleness verdict shared by the Stop gates
 * (Claude Code, Codex) and the git-watch signal: does the index on disk diverge from
 * the markdown corpus, and where. The only hook family that had no core — the
 * reconcile block used to live as three near-identical copies in the adapters.
 *
 * Two-stage reconcile: a listed file whose mtime and size still match its index
 * record is trusted unchanged — only the suspects are re-read and hashed. On a
 * mostly-unchanged corpus this turns the per-Stop full re-read into a directory
 * stat pass (the design doc's §12 fallback, now the default path).
 *
 * Fail-safe: a missing or broken index reads as "no verdict" (null); the callers
 * decide what silence means for their host protocol.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import { compareIndex, selectPaths } from "../../skills/kb-index/scripts/lib/kb-core.mjs";
import {
  computeHash,
  listMarkdownFiles,
  readConfig,
  readDoc,
  readIndex,
} from "../../skills/kb-index/scripts/lib/kb-fs.mjs";

/**
 * The staleness verdict, or null when there is no index or it matches the disk.
 * Returns the diverging paths in full (changed/added/missing) — the callers show
 * counts and the top few names.
 */
export function indexStaleness(projectDir) {
  const index = readIndex(projectDir);
  if (!index) return null;
  const config = readConfig(projectDir);
  const paths = selectPaths(listMarkdownFiles(projectDir), config);

  const byPath = new Map(index.map((record) => [record.path, record]));
  const disk = paths.map((path) => {
    const record = byPath.get(path);
    if (record && !unchanged(projectDir, path, record)) {
      // mtime+size drifted (or the record predates them) — re-hash to be sure.
      return { path, hash: computeHash(readDoc(projectDir, path)) };
    }
    return { path, hash: record ? record.hash : computeHash(readDoc(projectDir, path)) };
  });

  const { changed, added, missing } = compareIndex(index, disk);
  if (!changed.length && !added.length && !missing.length) return null;
  return { changed, added, missing };
}

/** True when the file on disk still has the mtime and size the index recorded —
 *  then its content hash is trusted from the index without re-reading the file. */
function unchanged(projectDir, path, record) {
  const { bytes, mtime } = record;
  if (!Number.isFinite(bytes) || !Number.isFinite(mtime) || mtime <= 0) return false;
  try {
    const stats = statSync(join(projectDir, ...String(path).split("/")));
    return stats.size === bytes && stats.mtimeMs === mtime;
  } catch {
    return false; // unreadable/missing — treat as changed; compareIndex will sort it out
  }
}

/** The human list of the worst offenders: "3 changed (docs/a.md, docs/b.md, +1 more)". */
export function stalenessDetail(paths, topN = 3) {
  if (!paths.length) return "0";
  const head = paths.slice(0, topN).join(", ");
  const rest = paths.length - Math.min(paths.length, topN);
  return `${paths.length} (${head}${rest > 0 ? `, +${rest} more` : ""})`;
}
