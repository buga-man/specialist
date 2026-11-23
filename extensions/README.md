# pi extensions (the hook counterpart)

pi agent has no separate "hook" mechanism — everything is done with extensions:
TypeScript modules loaded into pi that subscribe to events via `pi.on(...)`.

When this repository is installed as a pi package (`pi install ...`) or as an
oh-my-pi package (`omp install ...` — omp reads the same manifest, its `omp` key or
the legacy `pi` key), all `extensions/*.ts` and `extensions/*.js` are loaded
automatically.

## The plugin's ready-made extensions

- **spec-gate.ts** — blocks `edit`/`write` of files outside the files of the plan's open
  tasks (`docs/plans/`); modes via the `.spec-gate` file at the project root
  (`hard`/`soft`/`fast`/`off`: for files `fast` acts as `soft`, the process profile is
  delivered by plan-context). The logic is shared with the Claude Code hook:
  `../hooks/lib/spec-core.mjs`; the plan contract — in `../docs/hooks.md`.
- **secrets-guard.ts** — blocks `bash` running `git add` of sensitive files, `git commit`
  with secrets in the staged diff, and `git push` with secrets in the outgoing diff;
  exceptions — regexes in `.secrets-allow` at the project root. Logic:
  `../hooks/lib/secrets-core.mjs`.
- **vuln-guard.ts** — blocks `bash` running `git commit` when semgrep finds
  vulnerabilities in the staged files. No semgrep on PATH — a no-op. The opt-in per-edit
  scan (`.vuln-guard=always`) lives in edit-guard.ts. Logic: `../hooks/lib/vuln-core.mjs`.
- **suite-gate.ts** — blocks `bash` running `git commit` when the project's test
  command from `.suite-gate` (first line) exits non-zero. Opt-in: no file, empty, or
  `off` — pass-through; a spawn error or timeout is uncertainty, not a red suite.
  Logic: `../hooks/lib/suite-core.mjs`.
- **edit-guard.ts** — after a successful `edit`/`write`, in one handler and one
  deterministic order: the boundary-visibility notes (an edit of a plan's `- Files:`
  scope line or of the guard allowlists is called out), the project's formatter
  (prettier / ruff), the project's linter (eslint / ruff check / ktlint — if the project
  declares them), each `--fix`-ing what it can, and — under `.vuln-guard=always` — a
  semgrep scan. Failures mark the tool result as an error so that the agent fixes the
  file immediately; notes alone are appended to the result text. Logic:
  `../hooks/lib/format-core.mjs`, `lint-core.mjs`, `vuln-core.mjs`, `spec-core.mjs`.
- **plan-context.ts** — on the session's first turn injects one persistent message with
  orientation: the active plan, open tasks, the spec-gate mode; with no open tasks —
  the spec-chain line (the newest incomplete chain in docs/specs/ and the skill to
  resume with, derived from the slugs and `status:` metadata). Silent when there is
  nothing to report or the mode is `off`. After a `session_compact` the flag resets, so the
  orientation returns once the context was wiped. Logic:
  `../hooks/lib/plan-context-core.mjs`.
- **git-watch.ts** — after a successful `bash` that ran a tree-changing git operation,
  appends the staleness signal (stale `.kbindex` index, stale CODESTYLE.md) to the tool
  result. Logic: `../hooks/lib/git-watch-core.mjs` + `git-watch-host.mjs`.
- **codestyle-reminder.ts** — on `session_start` stores one persistent line when
  CODESTYLE.md may be stale (the same verdict and line the Claude Code hook injects).
  Logic: `../hooks/lib/git-watch-host.mjs` + `codestyle-core.mjs`.
- **kb-gate.ts** — when the documentation index diverged from the disk, forces one
  continuation turn carrying the rebuild command — the pi analog of the Claude Code
  Stop block (one continuation per settle, no loop; aborted runs are never
  continued). The wiring is per host: pi — a follow-up message from `agent_settled`
  (`triggerTurn`); oh-my-pi — a `{ decision: "block" }` refusal from the blocking
  `session_stop` stop hook (omp has no `agent_settled`). Logic:
  `../hooks/lib/kb-gate-core.mjs`.

After installing/editing extensions: `/reload`.

## How to add an extension

1. Create `extensions/<name>.ts`.
2. Export a default factory:

   ```ts
   export default function (pi) {
     pi.on("tool_call", async (event) => {
       // example: intercept a tool call
       // return { block: true, reason: "explanation" } — to block
       return { block: false };
     });
   }
   ```

3. For a quick check without reinstalling the package: `pi -e ./extensions/<name>.ts`.
   After edits: `/reload` inside pi.

## Useful events

- `before_agent_start` — modify the system prompt / inject context before the agent's turn
- `tool_call` — intercept, modify, or block a tool call
- `tool_result` — post-process a tool result
- `input` — intercept and transform user input
- `session_start` — session initialization
- `agent_settled` — the run settled (notification-only; a `triggerTurn` follow-up starts the next turn) — pi
- `session_stop` — the main-session blocking stop hook (a `{ decision: "block", reason }` return forces a continuation) — oh-my-pi
- `session_compact` — the context was compacted (plan-context re-orients after it)

The full list of events and the extension API:
https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md

## Host specifics

Extensions work in **pi** and **oh-my-pi** (omp — a pi fork that loads the same
`extensions/*.ts`; the only divergent wiring is kb-gate's, above). Claude Code hooks
go into `hooks/hooks.json`. Skills shared by the programs — in `skills/`.
