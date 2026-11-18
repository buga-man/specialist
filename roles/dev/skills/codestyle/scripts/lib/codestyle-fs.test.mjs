/**
 * Tests for the codestyle-fs.mjs walk — the code-file inventory behind `scan`.
 * A real tmp directory, no git needed. Run: node --test skills/codestyle/scripts/lib/codestyle-fs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkCodeFiles } from "./codestyle-fs.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "codestyle-fs-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test("walkCodeFiles: code files with line counts, forward slashes; markdown and skipped dirs stay out", () => {
  const dir = project({
    "src/core.mjs": "a\nb\nc\n", // 3 newlines → 4 split parts; the count is only for facts
    "src/deep/nested.ts": "x\r\ny\r\n", // CRLF counts the same
    "README.md": "not code\n",
    "docs/guide.md": "not code\n",
    "node_modules/dep/index.js": "dependency, not the repo's own\n",
    "dist/bundle.js": "build output\n",
    ".kbindex/doc.json": "derived artifact\n",
  });
  const files = walkCodeFiles(dir);
  assert.deepEqual(
    files.sort((a, b) => a.path.localeCompare(b.path)),
    [
      { path: "src/core.mjs", lines: 4 },
      { path: "src/deep/nested.ts", lines: 3 },
    ],
  );
});

test("walkCodeFiles: an empty project — an honest empty list", () => {
  assert.deepEqual(walkCodeFiles(project({})), []);
});
