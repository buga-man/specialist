# Plugin schema notes

The repository's scars — non-obvious host and marketplace constraints that cost a debugging
session once and are written down so they are never rediscovered the hard way (each section:
symptom → cause → rule).

## Skill frontmatter: a real YAML parser on the other side

- **Symptom:** a skill stops loading in the host (pi at least) — the frontmatter looks
  perfectly fine to a human reader.
- **Cause:** the host parses `description` with a real YAML parser. A plain scalar with
  `": "` inside (`description: Use it: everywhere`) reads as a nested mapping, and the
  whole load fails. The historical bug — fixed in commit 86be51f; `scripts/compliance.mjs`
  now rejects the shape before it ships.
- **Rule:** `description` is one line without colons — where one would stand, an em dash.

## Installing the plugin into ZCode by hand

- **Symptom:** there is no `zcode` CLI, and the app's marketplace flow is not an option
  (an unpushed commit, an offline machine) — the plugin has to be placed by hand.
- **Cause:** ZCode keeps two trees — the marketplace source
  (`~/.zcode/cli/plugins/marketplaces/<marketplace>/`) and the installed plugin
  (`~/.zcode/cli/plugins/cache/<marketplace>/<plugin>/<version>/`) — wired together by
  `installed_plugins.json`, whose `installPath` field points at the cache copy. None of
  it regenerates on its own.
- **Rule:** repack — `git archive <commit> | tar -x` into both the cache and the
  marketplaces directory. In git-bash, forward-slash paths only. The `installPath` edit
  in the manifest is never done through a `node -e` one-liner — bash mangles the quotes
  and escaping; a temporary `.js` script file makes the edit and is deleted after.

## File names in hooks/: node --test is watching

- **Symptom:** a new hook file lands in `hooks/lib/`, and `npm test` goes red on a file
  that is not a test at all.
- **Cause:** `npm test` runs `node --test hooks scripts skills`, and the runner adopts
  every file matching its test-name patterns — `test-*.mjs` among them. A hook named
  `test-<hook>.mjs` is executed as a test file and takes the suite down.
- **Rule:** hook files never start with `test-` (the reminder comment sits on
  `suite-gate.mjs`); test twins keep the `*.test.mjs` suffix.

## plugin.json: paths, not inventories — one version everywhere

- **Symptom:** Codex does not see the plugin's skills and hooks, or `npm test` goes red
  on a version field.
- **Cause:** the Codex manifest (`plugin.json`, the agent-plugins 1.0.0 schema) takes
  **paths** in `skills` and `hooks` — `./skills` and `./hooks/hooks-codex.json` — not
  file lists or globs. And every manifest — this one, `.claude-plugin/plugin.json`,
  `.zcode-plugin/plugin.json`, `package.json`, the marketplace fields, the generated
  role manifests — must carry the same version; `hooks/lib/hooks-manifest.test.mjs`
  enforces the sync.
- **Rule:** the two fields stay paths. A version change goes into `package.json` and the
  root manifests in one pass, the role trees are rebuilt with
  `node scripts/compliance.mjs --fix` — never sync one manifest by hand and hope the
  rest follow.
