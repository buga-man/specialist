/**
 * Tests for config-guard-core.mjs — the quality-tool config classifier.
 * The bar of every case: an EXISTING linter/formatter config or ignore file is named
 * for the block; a creation (the file is not on disk) is bootstrap and passes; a name
 * the list does not carry is not this guard's business (fail-safe — the adapter owns
 * the disk check, and a stat error there reads as a creation, never a block).
 * Run: node --test hooks/lib/config-guard-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { configGuardReason, protectedConfigBasenames } from "./config-guard-core.mjs";

const blocked = (filePath) => {
  const r = configGuardReason(filePath, true);
  assert.ok(r, filePath);
  assert.equal(r.includes("\n"), false, "reason must be a single line");
  assert.match(r, /^config-guard: "/);
  assert.match(r, /user's decision/);
  assert.match(r, /Fix the code the tool points at/);
  assert.match(r, /themselves/, "the deliberate bypass is named: the user edits it");
  return r;
};
const allowed = (filePath, exists = true) =>
  assert.equal(configGuardReason(filePath, exists), null, filePath);

test("every protected basename of an existing file is blocked", () => {
  const names = protectedConfigBasenames();
  assert.ok(names.length >= 30, "the list is the tool families, not a stub");
  for (const name of names) blocked(name);
});

test("every protected basename of a file not on disk is a creation — allowed", () => {
  for (const name of protectedConfigBasenames()) allowed(name, false);
});

test("case is folded — the Windows/macOS uppercase spelling is a real occurrence", () => {
  blocked(".ESLINTRC");
  blocked(".Eslintrc.JSON");
  blocked("Biome.JSON");
  blocked("RUFF.TOML");
});

test("subdirectory and absolute paths — the basename decides", () => {
  blocked("packages/lib/.eslintrc.json");
  blocked("tools/lint/ruff.toml");
  blocked("C:/repo/web/.prettierrc");
  blocked("C:\\repo\\web\\.prettierrc"); // backslashes must not hide the basename
  blocked("/home/u/repo/biome.jsonc");
});

test("non-configs and configs the list does not carry are not the guard's business", () => {
  allowed("src/index.ts");
  allowed("docs/hooks.md");
  allowed("package.json"); // carries eslintConfig/prettier inline — a documented residual
  allowed("tsconfig.json"); // a compiler config, not a quality-tool gate
  allowed(".gitignore"); // not a quality-tool ignore file
  allowed("eslint.config.spec.ts"); // a test of the config, not the config
  allowed("my.eslintrc.notes.md");
  allowed("biome.json.txt");
});

test("empty and absent paths read as nothing to classify", () => {
  allowed("", true);
  allowed(null, true);
  allowed(undefined, true);
  assert.equal(configGuardReason(".eslintrc", undefined), null, "no disk answer — a creation");
});
