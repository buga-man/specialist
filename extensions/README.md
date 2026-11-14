# pi extensions (the hook counterpart)

pi agent has no separate "hook" mechanism — everything is done with extensions:
TypeScript modules loaded into pi that subscribe to events via `pi.on(...)`.

When this repository is installed as a pi package (`pi install ...`), all
`extensions/*.ts` and `extensions/*.js` are loaded automatically.

## The plugin's ready-made extensions

- **spec-gate.ts** — blocks `edit`/`write` of files outside the files of the plan's open
  tasks (`docs/plans/`); modes via the `.spec-gate` file at the project root
  (`hard`/`soft`/`fast`/`off`: for files `fast` acts as `soft`, the process profile is
  delivered by plan-context). The logic is shared with the Claude Code hook:
  `../hooks/lib/spec-core.mjs`; the plan contract — in `../hooks/README.md`.
- **secrets-guard.ts** — blocks `bash` running `git add` of sensitive files, `git commit`
  with secrets in the staged diff, and `git push` with secrets in the outgoing diff;
  exceptions — regexes in `.secrets-allow` at the project root. Logic:
  `../hooks/lib/secrets-core.mjs`.
- **vuln-guard.ts** — blocks `bash` running `git commit` when semgrep finds
  vulnerabilities in the staged files; with `.vuln-guard=always` it also scans every
  edit. No semgrep on PATH — a no-op. Logic: `../hooks/lib/vuln-core.mjs`.
- **format-guard.ts** — after a successful `edit`/`write` runs the project's formatter
  (prettier / ruff) and auto-fixes; unfixable errors mark the tool result as an error so
  that the agent fixes the file immediately.
- **lint-guard.ts** — after a successful `edit`/`write` runs the project's linter
  (eslint / ruff check / ktlint — if the project declares them) with `--fix`; the
  remaining violations mark the result as an error. Logic: `../hooks/lib/lint-core.mjs`.
- **plan-context.ts** — on the session's first turn injects one persistent message with
  orientation: the active plan, open tasks, the spec-gate mode. Silent when there is no
  plan or the mode is `off`. Logic: `../hooks/lib/plan-context-core.mjs`.

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

The full list of events and the extension API:
https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md

## Host specifics

Extensions work **only in pi**. Claude Code hooks go into `hooks/hooks.json`.
Skills shared by both programs — in `skills/`.
