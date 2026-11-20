/**
 * Tests for scripts/check-extensions.mjs — the TypeScript-surface guard.
 * Run: node --test scripts/check-extensions.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBalance, extractImports, importFindings, tsFiles } from "./check-extensions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test("extractImports: named, aliased, inline type, type-only, default, namespace, side-effect", () => {
  const source = [
    'import { a, b as renamed, type Erased } from "./one.mjs";',
    'import type { Gone } from "./two.mjs";',
    'import def from "./three.mjs";',
    'import * as ns from "node:path";',
    'import "./side-effect.mjs";',
    'import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";',
    "// import { commented } from './nope.mjs';",
  ].join("\n");
  const imports = extractImports(source);
  assert.equal(imports.length, 7); // the commented line parses as none
  assert.deepEqual(imports[0].names, [
    { name: "a", typeOnly: false },
    { name: "b", typeOnly: false },
    { name: "Erased", typeOnly: true },
  ]);
  assert.deepEqual(imports[1].names, [{ name: "Gone", typeOnly: true }]);
  assert.deepEqual(imports[2].names, [{ name: "def", typeOnly: false }]);
  assert.deepEqual(imports[3].names, []); // namespace — nothing named to check
  assert.deepEqual(imports[4].names, []); // side-effect — the specifier still gets resolved
  assert.equal(imports[4].specifier, "./side-effect.mjs");
  assert.equal(imports[5].specifier, "@earendil-works/pi-coding-agent");
  assert.equal(imports[5].names.some((n) => n.name === "ExtensionAPI" && n.typeOnly), true);
});

test("checkBalance: balanced code with strings, templates, comments passes", () => {
  const source = [
    "const s = 'it\\'s fine';",
    'const d = "with } bracket { inside";',
    "const t = `tpl ${ { deep: [1, 2] } } and ${nested(`inner`)} end`;",
    "// comment with ( unbalanced [ brackets",
    "/* block } comment */ function f(a: string[]): { x: number } { return { x: 1 }; }",
  ].join("\n");
  assert.equal(checkBalance(source, "ok.ts"), null);
});

test("checkBalance: a missing closer, a stray closer and an unterminated string are findings", () => {
  assert.match(checkBalance("function f() { return 1;", "a.ts"), /opens and never closes/);
  assert.match(checkBalance("const a = 1);", "b.ts"), /closes nothing/);
  assert.match(checkBalance('const s = "never closed\\n', "c.ts").replaceAll("\\\\", "\\"), /unterminated string/);
  assert.match(checkBalance("const t = `open ${x", "d.ts"), /unterminated template/);
});

test("checkBalance: a template interpolation nested inside an object literal returns to the template", () => {
  // The regression shape: `${...}` inside `{...}` — the closing "}" of the object
  // must not be eaten as the interpolation's, nor the interpolation's as the object's.
  const source = 'const o = { msg: `count: ${[1, 2].length} items` , extra: 1 };';
  assert.equal(checkBalance(source, "tpl.ts"), null);
});

test("importFindings: a missing export, a missing file and an unknown package are findings", async () => {
  const dir = mkdtempSync(join(tmpdir(), "check-ext-"));
  dirs.push(dir);
  writeFileSync(join(dir, "core.mjs"), "export const real = 1;\nexport default null;\n");
  writeFileSync(
    join(dir, "plug.ts"),
    [
      'import { real, missing } from "./core.mjs";',
      'import { gone } from "./nope.mjs";',
      'import { x } from "some-random-package";',
      'import type { Shape } from "./core.mjs";',
    ].join("\n"),
  );
  const findings = await importFindings(join(dir, "plug.ts"));
  assert.equal(findings.filter((f) => f.includes('"missing"')).length, 1);
  assert.equal(findings.filter((f) => f.includes("resolves to nothing")).length, 1);
  assert.equal(findings.filter((f) => f.includes("not a host SDK")).length, 1);
  assert.equal(findings.filter((f) => f.includes("Shape")).length, 0); // type-only — erased
});

test("importFindings: the repository's own TypeScript surfaces are clean", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = tsFiles(root);
  assert.equal(files.length, 10); // nine extensions + the OpenCode plugin
  for (const file of files) {
    const findings = await importFindings(file);
    assert.deepEqual(findings, [], `${file}: ${findings.join("; ")}`);
  }
});
