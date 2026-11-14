/**
 * Tests for lint-core.mjs — project-declared linter detection and exit-code mapping.
 * Run: node --test hooks/lib/lint-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lintFile } from "./lint-core.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "lint-core-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const pkg = (extra = {}) => JSON.stringify({ name: "x", ...extra });

test("eslint: declared in package.json and the binary is present — runs with --fix", async () => {
  const dir = project({
    "package.json": pkg({ devDependencies: { eslint: "^9" } }),
    "node_modules/eslint/bin/eslint.js": "// stub",
  });
  const calls = [];
  const r = await lintFile({
    projectDir: dir,
    filePath: join(dir, "src/app.ts"),
    run: async (cmd, args) => {
      calls.push([cmd, args]);
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  assert.deepEqual(r, { ok: true, tool: "eslint", output: "" });
  assert.equal(calls[0][0], process.execPath);
  assert.ok(calls[0][1].includes("--fix"));
});

test("eslint: leftover violations (exit 1) go to the agent, a fatal error (exit 2) — fail-safe", async () => {
  const dir = project({
    "package.json": pkg({ dependencies: { eslint: "^9" } }),
    "node_modules/eslint/bin/eslint.js": "// stub",
  });
  const r1 = await lintFile({
    projectDir: dir,
    filePath: join(dir, "a.ts"),
    run: async () => ({ code: 1, stdout: "1:1 error no-unused-vars", stderr: "" }),
  });
  assert.equal(r1.ok, false);
  assert.match(r1.output, /no-unused-vars/);
  const r2 = await lintFile({
    projectDir: dir,
    filePath: join(dir, "a.ts"),
    run: async () => ({ code: 2, stdout: "", stderr: "Cannot read config" }),
  });
  assert.equal(r2, null);
});

test("eslint: not declared by the project or no binary — null (a transitive copy is ignored)", async () => {
  const bare = project({});
  assert.equal(await lintFile({ projectDir: bare, filePath: join(bare, "a.ts"), run: async () => ({ code: 0, stdout: "", stderr: "" }) }), null);
  const noBin = project({ "package.json": pkg({ devDependencies: { eslint: "^9" } }) });
  assert.equal(await lintFile({ projectDir: noBin, filePath: join(noBin, "a.ts"), run: async () => ({ code: 0, stdout: "", stderr: "" }) }), null);
});

test("ruff: no module — null; violations (exit 1) — to the agent; clean (exit 0) — ok", async () => {
  const dir = project({});
  const noRuff = await lintFile({
    projectDir: dir,
    filePath: join(dir, "a.py"),
    run: async () => ({ code: 1, stdout: "", stderr: "No module named ruff" }),
  });
  assert.equal(noRuff, null);
  const dirty = await lintFile({
    projectDir: dir,
    filePath: join(dir, "a.py"),
    run: async (cmd, args) => {
      assert.ok(args.includes("check") && args.includes("--fix"));
      return { code: 1, stdout: "a.py:1:1: F401 unused import", stderr: "" };
    },
  });
  assert.equal(dirty.ok, false);
  assert.match(dirty.output, /F401/);
  const clean = await lintFile({ projectDir: dir, filePath: join(dir, "a.py"), run: async () => ({ code: 0, stdout: "", stderr: "" }) });
  assert.deepEqual(clean, { ok: true, tool: "ruff", output: "" });
});

test("ktlint: declared in gradle and available — formats; not declared or not found — null", async () => {
  const declared = project({ "build.gradle.kts": 'plugins { id("org.jlleitschuh.gradle.ktlint") }' });
  const ok = await lintFile({
    projectDir: declared,
    filePath: join(declared, "A.kt"),
    run: async (cmd, args) => {
      if (args[0] === "--version") return { code: 0, stdout: "ktlint 1.3", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  assert.deepEqual(ok, { ok: true, tool: "ktlint", output: "" });

  const broken = project({ "build.gradle.kts": "ktlint" });
  assert.equal(
    await lintFile({ projectDir: broken, filePath: join(broken, "A.kt"), run: async () => ({ code: null, stdout: "", stderr: "" }) }),
    null,
  );
  const undeclared = project({});
  assert.equal(
    await lintFile({ projectDir: undeclared, filePath: join(undeclared, "A.kt"), run: async () => ({ code: 0, stdout: "", stderr: "" }) }),
    null,
  );
});

test("file outside the project and an unknown extension — null", async () => {
  const dir = project({});
  assert.equal(await lintFile({ projectDir: dir, filePath: "C:/elsewhere/a.ts", run: async () => ({ code: 0, stdout: "", stderr: "" }) }), null);
  assert.equal(await lintFile({ projectDir: dir, filePath: join(dir, "a.rb"), run: async () => ({ code: 0, stdout: "", stderr: "" }) }), null);
});
