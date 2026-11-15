# Hooks — developer note

This directory holds the hook machinery of the plugin. The logic lives in `lib/`:
`*-core.mjs` files are pure, I/O-free cores; `<hook>.mjs` / `<hook>-codex.mjs` are thin
per-host adapters that translate one host event into a core call and the verdict back
into the host protocol. Registration — two manifests: `hooks.json` (Claude Code, and
ZCode — which speaks the same hook protocol: event → matcher → command) and
`hooks-codex.json` (Codex; the root `plugin.json` points
Codex at it). The pi counterparts live in `../extensions/`, the OpenCode plugin in
`../plugins/opencode/`.

Invariants:

- **Fail-safe**: an internal error, garbage config, or a missing dependency → allow /
  skip, exit 0 — never block. Blocking is only explicit and always carries an
  explanation of the way forward.
- **One logic, five hosts** (four wrappers — ZCode reuses the Claude Code adapters
  verbatim): every decision lives in a shared core; adapters stay thin.
  New logic goes into a core (with a test next to it), not into an adapter.
- **Adapter protocols**: Claude Code — stdin JSON in, exit 2 + stderr to block; Codex —
  stdin JSON in, JSON on stdout (`apply_patch` edits, `additionalContext`,
  `{"decision":"block"}` on Stop); OpenCode — throws from `execute.before`; pi —
  `pi.on(...)` extension events (TypeScript in `extensions/`).

The per-hook behavior contracts, the spec-gate modes, and the plan contract are
documented in [docs/hooks.md](../docs/hooks.md) — this file does not duplicate them.

Manual checks (the host substitutes `${CLAUDE_PLUGIN_ROOT}` itself):

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"src/x.ts"},"cwd":"<project with a plan>"}' \
  | node "<plugin>/hooks/lib/spec-gate.mjs"; echo "exit=$?"
echo '{"cwd":"<project with an open plan>"}' | node "<plugin>/hooks/lib/plan-context.mjs"
```

Tests of all cores: `npm test` at the repository root.
