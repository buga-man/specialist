/**
 * Tests for the host manifests and hook registrations: every hook command must point at
 * an existing adapter, and every host manifest (Codex agent plugin, Claude Code plugin,
 * marketplace, pi package, ZCode plugin, omp package key) must reference paths that exist.
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
  assert.match(commands, /edit-guard-codex\.mjs/);
  assert.match(commands, /git-watch-codex\.mjs/);
  assert.match(commands, /kb-gate-codex\.mjs/);
  assert.doesNotMatch(commands, /skill-gate\.mjs/); // Codex has no Skill tool
});

test("post-edit guards: exactly one merged edit-guard command per host — no concurrent format/lint processes", () => {
  const cases = [
    ["hooks/hooks.json", "edit-guard.mjs"],
    ["hooks/hooks-codex.json", "edit-guard-codex.mjs"],
  ];
  for (const [file, adapter] of cases) {
    const manifest = readJSON(file);
    const editGroups = (manifest.hooks.PostToolUse ?? []).filter((g) => /Edit/.test(g.matcher || ""));
    assert.equal(editGroups.length, 1, `${file}: one edit matcher group`);
    const commands = commandHandlers({ hooks: { PostToolUse: editGroups } });
    assert.equal(commands.length, 1, `${file}: exactly one command hook on the edit event`);
    assert.match(commands[0], new RegExp(adapter));
  }
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

  // The role plugins: skills-only siblings of the full bundle, generated from the
  // roles map into roles/<role>/ (compliance flags drift; this checks the wiring —
  // the marketplace entry resolves to a directory with a plugin manifest).
  const roles = ["analyst", "dev", "qa"];
  assert.equal(marketplace.plugins.length, 1 + roles.length, "the bundle + three role plugins");
  marketplace.plugins.slice(1).forEach((entry, i) => {
    const role = roles[i];
    assert.equal(entry.name, `specialist-${role}`, `marketplace entry ${i + 1}`);
    assert.equal(entry.source, `./roles/${role}`);
    assert.ok(existsSync(join(REPO_ROOT, "roles", role, ".claude-plugin", "plugin.json")), `${role} manifest`);
    assert.ok(existsSync(join(REPO_ROOT, "roles", role, "plugin.json")), `${role} Codex manifest`);
    assert.ok(existsSync(join(REPO_ROOT, "roles", role, "skills")), `${role} skills tree`);
  });

  const piPackage = readJSON("package.json");
  assert.equal(piPackage.name, "specialist");
  assert.deepEqual(piPackage.pi.skills, ["./skills"]);
  assert.deepEqual(piPackage.pi.extensions, ["./extensions"]);
  assert.ok(existsSync(join(REPO_ROOT, "skills")));
  assert.ok(existsSync(join(REPO_ROOT, "extensions")));

  assert.ok(existsSync(join(REPO_ROOT, "plugins/opencode/index.ts")), "OpenCode plugin entry");

  // ZCode is protocol-compatible with Claude Code for hooks (the same seven events, the
  // same SessionStart matchers, ${CLAUDE_PLUGIN_ROOT}, exit 2 = block), so it reuses
  // hooks.json and the Claude Code adapters — no ZCode-specific manifest wiring.
  const zcodePlugin = readJSON(".zcode-plugin/plugin.json");
  assert.equal(zcodePlugin.name, "specialist");
  assert.equal(zcodePlugin.skills, "./skills");
  assert.equal(zcodePlugin.hooks, "./hooks/hooks.json");
  assert.ok(existsSync(join(REPO_ROOT, zcodePlugin.skills)));
  assert.ok(existsSync(join(REPO_ROOT, zcodePlugin.hooks)));
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

test("omp-only surfaces: the omp layer rides the omp manifest key alone — base hosts stay clean", () => {
  const pkg = readJSON("package.json");

  // The omp layer exists and is wired: the command modules are listed in the omp
  // manifest key and resolve to real files; the rule and prompt trees omp loads
  // conventionally (the only host that scans rules/ and prompts/) are present.
  assert.ok(Array.isArray(pkg.omp.commands) && pkg.omp.commands.length > 0, "omp.commands listed");
  for (const entry of pkg.omp.commands) {
    assert.match(entry, /^\.\/omp\/commands\/[^/]+\.ts$/, `omp command path shape: ${entry}`);
    assert.ok(existsSync(join(REPO_ROOT, entry)), `omp command file exists: ${entry}`);
  }
  assert.ok(existsSync(join(REPO_ROOT, "rules")), "rules/ present (omp-only conventional load)");
  assert.ok(existsSync(join(REPO_ROOT, "prompts")), "prompts/ present (omp-only conventional load)");

  // The pi manifest twin stays base (skills + extensions only) — the layer must not
  // leak to the host that shares the extensions tree.
  assert.equal(pkg.pi.commands, undefined, "pi key carries no commands");
  assert.deepEqual(Object.keys(pkg.pi).sort(), ["extensions", "skills"], "pi key stays base");

  // The leak-prone conventional plugin dirs stay absent from the repo root: Claude
  // Code and ZCode read commands/ and agents/ from plugin packages, so an omp
  // command shipped there would ride every marketplace install.
  for (const leak of ["commands", "agents"]) {
    assert.ok(!existsSync(join(REPO_ROOT, leak)), `no root-level ${leak}/ (Claude Code and ZCode would load it)`);
  }

  // The omp fork of the settle gate stays wired and bounded: the session_stop fork
  // exists and carries the settle budget (source probe — the TS branches have no
  // executable tests here).
  const kbGate = readFileSync(join(REPO_ROOT, "extensions", "kb-gate.ts"), "utf8");
  assert.match(kbGate, /session_stop/, "kb-gate registers the omp settle fork");
  assert.match(kbGate, /SETTLE_BUDGET/, "kb-gate bounds the omp continuation chain");
});

test("versions: every manifest field carries the same version (the version-sync rule, enforced)", () => {
  const marketplace = readJSON(".claude-plugin/marketplace.json");
  const versions = {
    "claude-plugin/plugin.json": readJSON(".claude-plugin/plugin.json").version,
    "plugin.json (Codex)": readJSON("plugin.json").version,
    "package.json (pi)": readJSON("package.json").version,
    "zcode-plugin/plugin.json (ZCode)": readJSON(".zcode-plugin/plugin.json").version,
    "marketplace.json metadata": marketplace.metadata?.version,
    "marketplace.json plugins[0]": marketplace.plugins?.[0]?.version,
    "marketplace.json root": marketplace.version,
  };
  // The role plugins' generated manifests ride the same version (compliance rebuilds
  // them from package.json — this keeps the rule honest after a bump).
  for (const role of ["analyst", "dev", "qa"]) {
    versions[`roles/${role}/plugin.json`] = readJSON(`roles/${role}/plugin.json`).version;
    versions[`roles/${role}/.claude-plugin/plugin.json`] = readJSON(
      `roles/${role}/.claude-plugin/plugin.json`,
    ).version;
  }
  marketplace.plugins.slice(1).forEach((entry, i) => {
    versions[`marketplace.json plugins[${i + 1}] (${entry.name})`] = entry.version;
  });
  for (const [place, version] of Object.entries(versions)) {
    assert.ok(typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version), `${place}: ${version}`);
  }
  const unique = new Set(Object.values(versions));
  assert.equal(unique.size, 1, `versions diverged: ${JSON.stringify(versions)}`);
});
