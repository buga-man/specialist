/**
 * Tests for kb-gate-core.mjs — the two-stage (stat-gated) index reconcile shared by
 * the Stop gates and git-watch.
 * Run: node --test hooks/lib/kb-gate-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { computeHash, writeIndex } from "../../skills/kb-index/scripts/lib/kb-fs.mjs";
import { indexStaleness, stalenessDetail } from "./kb-gate-core.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Temp project with documents and an index built from the real file stats. */
function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kb-gate-core-"));
  dirs.push(dir);
  const records = [];
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    const stat = statSync(abs);
    records.push({
      path: rel,
      hash: computeHash(content),
      bytes: stat.size,
      mtime: stat.mtimeMs,
    });
  }
  return { dir, records };
}

function indexTo({ dir, records }) {
  writeIndex(dir, records, { config: "test" });
}

test("indexStaleness: in sync → null; no index → null", () => {
  const p = project({ "docs/a.md": "# A\n" });
  indexTo(p);
  assert.equal(indexStaleness(p.dir), null);
  assert.equal(indexStaleness(p.dir), null); // second call — the stat gate agrees
  assert.equal(indexStaleness(p.dir), null); // and a third — cheap, no full re-read
});

test("indexStaleness: an edited, an added and a deleted document are named", () => {
  const p = project({ "docs/a.md": "# A\n", "docs/b.md": "# B\n", "docs/gone.md": "# G\n" });
  indexTo(p);

  writeFileSync(join(p.dir, "docs", "a.md"), "# A changed\n");
  const added = join(p.dir, "docs", "new.md");
  writeFileSync(added, "# New\n");
  unlinkSync(join(p.dir, "docs", "gone.md"));

  const verdict = indexStaleness(p.dir);
  assert.ok(verdict, "stale after edits");
  assert.deepEqual(verdict.changed, ["docs/a.md"]);
  assert.deepEqual(verdict.added, ["docs/new.md"]);
  assert.deepEqual(verdict.missing, ["docs/gone.md"]);
});

test("indexStaleness: an mtime-only touch re-hashes and stays honest (content same → null)", () => {
  const p = project({ "docs/a.md": "# A\n" });
  indexTo(p);
  // Same content, same size, bumped mtime — the stat gate misses, the hash catches it.
  const next = Date.now() / 1000 + 60;
  utimesSync(join(p.dir, "docs", "a.md"), next, next);
  assert.equal(indexStaleness(p.dir), null);
});

test("stalenessDetail: counts, names, and the tail marker", () => {
  assert.equal(stalenessDetail([]), "0");
  assert.equal(stalenessDetail(["docs/a.md"]), "1 (docs/a.md)");
  assert.equal(stalenessDetail(["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md"]), "4 (docs/a.md, docs/b.md, docs/c.md, +1 more)");
});
