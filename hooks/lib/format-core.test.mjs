/**
 * Tests for format-core.mjs — the formatter logic of the format-guard hook.
 * Run: node --test hooks/lib/format-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { formatFile } from "./format-core.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Temp project: pkg becomes package.json, files are created by path. */
function project(pkg = null, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "format-core-"));
  dirs.push(dir);
  const all = pkg ? { "package.json": JSON.stringify(pkg), ...files } : files;
  for (const [rel, content] of Object.entries(all)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const ok = { code: 0, stdout: "", stderr: "" };

test("prettier runs when the project declares it (bin layout of prettier >= 3)", async () => {
  const dir = project(
    { name: "x", devDependencies: { prettier: "^3.0.0" } },
    { "node_modules/prettier/bin/prettier.cjs": "#!/usr/bin/env node" },
  );
  const calls = [];
  const res = await formatFile({
    projectDir: dir,
    filePath: join(dir, "src", "a.ts"),
    run: async (cmd, args) => {
      calls.push([cmd, ...args]);
      return ok;
    },
  });
  assert.equal(res?.tool, "prettier");
  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], process.execPath);
  assert.ok(calls[0].includes("--write"));
  assert.ok(!calls[0].includes("--log-level")); // dropped: prettier 2 chokes on it
});

test("prettier 2 layout (bin-prettier.js) is found", async () => {
  const dir = project(
    { name: "x", devDependencies: { prettier: "^2.8.0" } },
    { "node_modules/prettier/bin-prettier.js": "#!/usr/bin/env node" },
  );
  const res = await formatFile({ projectDir: dir, filePath: join(dir, "a.ts"), run: async () => ok });
  assert.equal(res?.tool, "prettier");
});

test("a transitive prettier in node_modules is ignored", async () => {
  const dir = project({ name: "x" }, { "node_modules/prettier/bin/prettier.cjs": "" });
  let called = false;
  const res = await formatFile({
    projectDir: dir,
    filePath: join(dir, "a.ts"),
    run: async () => {
      called = true;
      return ok;
    },
  });
  assert.equal(res, null);
  assert.equal(called, false);
});

test("declared prettier without an installed bin → skip", async () => {
  const dir = project({ name: "x", devDependencies: { prettier: "^3.0.0" } });
  const res = await formatFile({ projectDir: dir, filePath: join(dir, "a.ts"), run: async () => ok });
  assert.equal(res, null);
});

test("python: falls back from python to py; missing ruff module → skip", async () => {
  const dir = project({ name: "x" });
  const seq = [];
  const res = await formatFile({
    projectDir: dir,
    filePath: join(dir, "a.py"),
    run: async (cmd) => {
      seq.push(cmd);
      if (cmd === "python") return { code: null, stdout: "", stderr: "" }; // no interpreter
      return ok;
    },
  });
  assert.equal(res?.tool, "ruff");
  assert.deepEqual(seq, ["python", "py"]);

  const res2 = await formatFile({
    projectDir: dir,
    filePath: join(dir, "a.py"),
    run: async () => ({ code: 1, stdout: "", stderr: "No module named ruff" }),
  });
  assert.equal(res2, null);

  // ruff missing under `python` but present under `py -3` — the second interpreter gets its chance.
  const seq2 = [];
  const res3 = await formatFile({
    projectDir: dir,
    filePath: join(dir, "a.py"),
    run: async (cmd) => {
      seq2.push(cmd);
      if (cmd === "python") return { code: 1, stdout: "", stderr: "No module named ruff" };
      return ok;
    },
  });
  assert.equal(res3?.tool, "ruff");
  assert.deepEqual(seq2, ["python", "py"]);
});

test("non-code files are ignored", async () => {
  const dir = project({ name: "x", devDependencies: { prettier: "^3.0.0" } });
  const res = await formatFile({
    projectDir: dir,
    filePath: join(dir, "README.md"),
    run: async () => ok,
  });
  assert.equal(res, null);
});

test("unfixable formatter errors are surfaced for the agent", async () => {
  const dir = project(
    { name: "x", devDependencies: { prettier: "^3.0.0" } },
    { "node_modules/prettier/bin/prettier.cjs": "" },
  );
  const res = await formatFile({
    projectDir: dir,
    filePath: join(dir, "broken.ts"),
    run: async () => ({ code: 2, stdout: "", stderr: "SyntaxError: unexpected token" }),
  });
  assert.equal(res.ok, false);
  assert.match(res.output, /SyntaxError/);
});
