/**
 * Tests for the host manifests and hook registrations: every hook command must point at
 * an existing adapter, and every host manifest (Codex agent plugin, Claude Code plugin,
 * marketplace, pi package) must reference paths that exist.
 * Run: node --test hooks/lib/hooks-manifest.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const readJSON = (rel) => JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8"));

function commandHandlers(manifest) {
  const out = [];
  for (const [, groups] of Object.entries(manifest.hooks ?? {})) {
    for (const group of groups) {
      for (const handler of group.hooks ?? []) {
        if (handler.type === "command") out.push(handler.command);
      }
    }
  }
  return out;
}

test("hook registrations: every command is a node call into hooks/lib and the file exists", () => {
  for (const file of ["hooks/hooks.json", "hooks/hooks-codex.json"]) {
    const manifest = readJSON(file);
    assert.ok(manifest.hooks && Object.keys(manifest.hooks).length > 0, `${file}: hooks present`);
    const commands = commandHandlers(manifest);
    assert.ok(commands.length > 0, `${file}: has command handlers`);
    for (const command of commands) {
      assert.match(
        command,
        /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/lib\/[a-z0-9-]+\.mjs"$/,
        `${file}: unexpected command shape: ${command}`,
      );
      const adapter = command.replace(/^node "\$\{CLAUDE_PLUGIN_ROOT\}\//, "").replace(/"$/, "");
      assert.ok(existsSync(join(REPO_ROOT, adapter)), `${file}: adapter exists: ${adapter}`);
    }
  }
});

test("hooks-codex.json uses the Codex-specific adapters and never the Skill tool", () => {
  const codex = readJSON("hooks/hooks-codex.json");
  const commands = commandHandlers(codex).join("\n");
  assert.match(commands, /spec-gate\.mjs/);
  assert.match(commands, /secrets-guard\.mjs/);
  assert.match(commands, /git-watch-codex\.mjs/);
  assert.match(commands, /kb-gate-codex\.mjs/);
  assert.doesNotMatch(commands, /skill-gate\.mjs/); // Codex has no Skill tool
});

test("host manifests: names are aligned and referenced paths exist", () => {
  const codexManifest = readJSON("plugin.json");
  assert.equal(codexManifest.name, "specialist");
  assert.equal(codexManifest.skills, "./skills");
  assert.equal(codexManifest.hooks, "./hooks/hooks-codex.json");
  assert.ok(existsSync(join(REPO_ROOT, codexManifest.skills)));
  assert.ok(existsSync(join(REPO_ROOT, codexManifest.hooks)));

  const ccPlugin = readJSON(".claude-plugin/plugin.json");
  assert.equal(ccPlugin.name, "specialist");
  assert.ok(existsSync(join(REPO_ROOT, "hooks/hooks.json")));

  const marketplace = readJSON(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, "specialist");
  assert.equal(marketplace.plugins[0].name, "specialist");
  assert.equal(marketplace.plugins[0].source, "./");

  const piPackage = readJSON("package.json");
  assert.equal(piPackage.name, "specialist");
  assert.deepEqual(piPackage.pi.skills, ["./skills"]);
  assert.deepEqual(piPackage.pi.extensions, ["./extensions"]);
  assert.ok(existsSync(join(REPO_ROOT, "skills")));
  assert.ok(existsSync(join(REPO_ROOT, "extensions")));

  assert.ok(existsSync(join(REPO_ROOT, "plugins/opencode/index.ts")), "OpenCode plugin entry");
});

test("timeouts: every registration in both manifests sets a numeric timeout — a hung tool must never stall a turn", () => {
  for (const file of ["hooks/hooks.json", "hooks/hooks-codex.json"]) {
    const manifest = readJSON(file);
    const timeouts = [];
    for (const [, groups] of Object.entries(manifest.hooks)) {
      for (const group of groups) {
        for (const handler of group.hooks ?? []) {
          if (handler.type === "command") timeouts.push(handler.timeout);
        }
      }
    }
    assert.ok(timeouts.length > 0, `${file}: registrations present`);
    for (const t of timeouts) {
      assert.ok(Number.isFinite(t) && t >= 10 && t <= 600, `${file}: timeout ${t}`);
    }
  }
});

test("SessionStart matchers include the compaction re-orientation on both hosts", () => {
  for (const file of ["hooks/hooks.json", "hooks/hooks-codex.json"]) {
    const manifest = readJSON(file);
    const matchers = (manifest.hooks.SessionStart ?? []).map((g) => g.matcher).join("|");
    assert.match(matchers, /clear/, `${file}: clear`);
    assert.match(matchers, /compact/, `${file}: compact`);
  }
});

test("versions: the four manifests carry the same version (the version-sync rule, enforced)", () => {
  const versions = {
    "claude-plugin/plugin.json": readJSON(".claude-plugin/plugin.json").version,
    "plugin.json (Codex)": readJSON("plugin.json").version,
    "package.json (pi)": readJSON("package.json").version,
    "marketplace.json metadata": readJSON(".claude-plugin/marketplace.json").metadata?.version,
  };
  for (const [place, version] of Object.entries(versions)) {
    assert.ok(typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version), `${place}: ${version}`);
  }
  const unique = new Set(Object.values(versions));
  assert.equal(unique.size, 1, `versions diverged: ${JSON.stringify(versions)}`);
});
