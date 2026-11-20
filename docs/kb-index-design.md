# kb-index — a map of documentation for agents

The skill and the hook are part of the repository's single plugin (`specialist`).

## 1. Rationale

In a large documentation corpus an agent spends tokens reading document bodies just to decide whether it needs a document. The `kb-index` skill builds a machine index over the "face" of a document (id, title, gist, anchor) plus directory maps, so that answering "where is this documented" costs one command instead of a dozen reads.

## 2. What was measured

Sample corpus: 1796 markdown files (tracked + new), 414 directories, 32 MB of text
(a private working corpus; query and path names in the examples below are synthetic).

| Metric | Value |
|---|---|
| Median document body | 6902 chars (3137 tokens) |
| Median anchor section | 1220 chars |
| Documents with frontmatter | 852 of 1796; with `description`/`summary` — 68 (all in `meta/agent-pack/skills`) |
| Documents with nested frontmatter structure | 83 |
| Directories with a single service | 76 of 79 |
| Files isolated by links | 47% |
| Link connectivity components | 871 |
| Body grep precision | 19–25% of hits relevant |
| Face matches | `runbook` 21, `audit` 69, `reference` 37, `template` 37 |
| Markdown links between documents | 6442 |
| Index scan time | 2–3 ms per 350 KB |
| Full index-vs-disk reconciliation | 114 ms (read + sha1, Node) |
| Duplicate `id`s | 28, 8 of them within a single directory |
| Tokens in relation fields | 1551: 307 resolve unambiguously, 184 ambiguously, 1060 — free text |

## 3. Scope

**Goals.** Answering "where is this documented" — one command, not a dozen reads. A directory map shows what a directory contains without reading bodies. After a document edit, the index does not diverge from the text.

**Non-goals.** Not vector search: the corpus is labeled manually, exact identifiers matter more than semantics. Not grep-like body search: a raw pass over bodies yields 19–25% relevant hits. Body search exists, but as the second tier — per-section term statistics with BM25 ranking (§7): the face stays first, bodies are not copied into the index. Not documentation rewriting: the plugin reads and indexes, but never edits texts.

**Already done manually, not duplicated.** The ADR registries (`architecture/adr/README.md`) and
section maps (`architecture/README.md`), the ready-made logical-path configs — the plugin
indexes them alongside everything else but does not replace or rewrite them.

**Explicitly out of scope.** Existing `id`s are not edited (28 duplicates stay as they are — breaking external links costs more). We never write to foreign files at all: a missing gist is added by the agent **into the document body** or into the same document's frontmatter — that is an edit of the source, not of a service overlay. We do not rely on the `description`/`summary` fields — project documents do not have them.

**Privacy.** A directory like `context/source-briefs/` (client briefs) is untouchable: the plugin neither edits it nor copies brief bodies into the index. If briefs get into the index, no gist is extracted from them — only metadata remains. The rule "which directories are not body-indexed" is set by config, not by a hard-coded path — the plugin is portable and knows nothing about the repository.

## 4. Artifacts

Everything generated lives in `.kbindex/` at the project root. The directory ignores itself:
it contains a `.gitignore` with `*`, so the index never reaches git and requires no edits
to the foreign `.gitignore`.

```
.kbindex/
├── index.json          # machine index: one entry per document
├── sections.json       # per-section term statistics for body search (§7)
└── maps/               # directory maps, a mirror of the tree
    ├── INDEX.md        # root map: domains and their maps
    └── documentation/
        └── product/
            └── context/
                └── requirements/
                    └── INDEX.md
```

`index.json` — one entry per document:

```json
{
  "path": "documentation/product/context/requirements/REQ-015-inspection-point.md",
  "id": "REQ-015",
  "title": "Inspection point",
  "status": "draft",
  "owner": "BA",
  "service": "product-docs",
  "docType": "br",
  "aliases": ["пропускной пункт"],
  "created": "2026-10-19",
  "lastUpdated": "2026-10-29",
  "gist": "Placement and factory are separated; the SKU list is cut by point binding.",
  "anchor": { "heading": "2. Inspection point", "line": 42, "chars": 3180 },
  "links": ["architecture/adr/ADR-007-inspection-point-entity.md"],
  "refs": [{ "key": "parent", "value": "REQ-015", "resolved": "…/REQ-015-inspection-point.md" }],
  "hash": "…",
  "bytes": 8123,
  "mtime": 1759300000000
}
```

The key is `path`. `id` is an attribute: it is not unique (28 duplicates), so the relation resolver works per directory and treats `id` as a label. `hash` is the sha1 of the content; staleness is detected by it. `anchor.line` is the line of the heading itself, `anchor.chars` is the length of its content: the agent reads a window from the anchor, not the whole document. `links` — markdown links to neighboring documents (6442 on the corpus); `refs` — parsed frontmatter relations with their resolution results.

`docType` is taken from `doc-type`, then from `type`; on the corpus 132 documents have `doc-type`.

`sections.json` — a derived artifact of the second search tier. It **contains no document
text**: per section it stores a heading, an absolute line, and a term frequency map.

```json
{
  "schema": 1,
  "docs": [
    {
      "path": "documentation/product/context/requirements/REQ-015-inspection-point.md",
      "sections": [
        { "h": "2. Inspection point", "line": 42, "terms": { "inspection": 3, "sku": 2, "point": 4 } }
      ]
    }
  ]
}
```

A section is the text from an ATX heading of any level to the next one; the prelude before the first
heading is a section with an empty `h`; headings inside code blocks do not open sections.
Terms are counted over the heading and the section text together: a word from the heading finds
a section just like a word from the text. A section longer than 6000 chars contributes words up to
a word boundary — an application-log appendix's frequencies do not flood the artifact. Documents in
`exclude` contribute no sections at all — §3 privacy extends to the term statistics.
The file is written compactly (no indentation): 260 KB on the 24 documents of the plugin's repository,
projected to tens of MB on the sample corpus — acceptable for a non-versioned
local artifact.

## 5. The directory map

One `INDEX.md` per directory. The columns are exactly the ones an agent uses to decide whether to read a document.

```markdown
# requirements — business requirements

12 documents.

| ID | Title | Gist | Anchor | File |
|---|---|---|---|---|
| REQ-012 | Access audit log | What is written when access rights change | §2. Event inventory | documentation/product/context/requirements/REQ-012.md |
| REQ-015 | Inspection point | Placement and factory are separated; the SKU list is cut by point binding | §2. Inspection point | documentation/product/context/requirements/REQ-015.md |
```

A map row = an index entry. `Gist` is trimmed to 120 chars at a word boundary. `Anchor` — the heading of the largest `##`/`###` section (1687 of 1793 documents have one): it is the entry point that gets to the point. `File` — the document path: without it the row cannot be identified (half the documents have neither `id` nor `title`). Directories with a single document get no map — the document's row lands in the parent's map, but the directory itself stays visible in the subdirectory list.

## 6. How the gist and the anchor are built

The **gist** comes from the first source that yields meaningful text:

1. the frontmatter field `description` / `summary` — only 68 corpus documents have it (all in `meta/agent-pack/skills`), project documents — zero;
2. the first **prose** paragraph of the body: scanning starts at the top, skipping frontmatter, headings, quotes (`>`), tables (`|`), code blocks, horizontal rules (`---`); the first paragraph that does not start with these markers is the gist;
3. otherwise — empty; the document goes to the report, not into the index.

Checked on the corpus of 1796 documents: 52 have no prose paragraph at all, 27 start with service text ("Status: …"), 73 have one shorter than 40 chars. **Usable — 1645 (92%)**. Lists must not be skipped: they are often the very content ("- Step 1. …"); only a list of three or more items with no prose is skipped — it looks like a table of contents.

Skipping quotes is mandatory: in most project documents what follows H1 immediately is a quote linking to a decision, not the content.

The **anchor** is the heading of the section with the largest volume of **own** text (text up to the next heading of the same or lower level). Nesting is accounted for: a `###` inside a `##` cannot beat its parent, because it is counted separately.

The levels are `##` and `###`. `#` sections are not considered: that is the document title, not a section.

Checked: 1690 of 1796 documents have an anchor (94%), the median anchor section length is 1220 chars. In 18 cases (1%) the longest section turns out to be an appendix or a migration log — those go into a separate report, but the anchor stays: a 1% inaccuracy is no reason to complicate the rule.

**The relation resolver.** `parent`, `depends_on`, `children`, `br`, `us` amount to 1551 tokens on the corpus, and most of them are **not identifiers but free text**: `F1-AB-05a, F1-AB-06b (core!72, merged Oct 16)`, `order-service-004-required-fields-on-transition`, `billing`. Therefore:

1. a token counts as a link **only if it matches** an existing `id` or a file slug; otherwise it is free text and does not reach the report;
2. a match is resolved: the same directory first, then the whole project;
3. several matches — **no guessing**: marked ambiguous, both candidates shown in the report.

On the corpus: 307 tokens resolve unambiguously, 184 — ambiguously (42 of them in `requirements`), 1060 are free text and not links.

The terms "directory" and "project" are concrete here: a directory is the file's directory, a project is the repository root. There is no intermediate "domain" in the rules: measurement showed the directory is already semantic (76 of 79 directories with `service` contain exactly one service).

## 7. Search

The index is 350 KB for 1793 documents. It is scanned in full in 2–3 ms, so a separate search engine is unnecessary: a plain pass over the lines with substring checks.

**Morphology.** Substring matching breaks on inflected forms: "boxes" does not find "boxed". Full stemming does not work either — a bare word prefix loses real connections and collapses the result count (measured on the original corpus: recall fell from 37 to 8 for a related-word query).

The rule: a query word counts as found if the field contains an **exact occurrence**, or a word starting with it minus the last character ("boxed" ⊃ "boxe"). The second option is a fallback only; it does not replace the first.

Measured on the original corpus (heavily inflected language, where the fallback matters most): one query went from 8 exact-match results to 35 with the extended match, another from 59 to 78; "runbook", "reference", "audit", "template" — unchanged (the fallback adds no noise).

**Ranking:** exact match on `id` → `title` → `anchor.heading` → `gist` → `path`. The query is split on whitespace, all words must be found (AND). On equal rank — more matches in `title`, then a shorter path.

Measured effect against body grep: `runbook` 21 vs 93, `audit` 69 vs 257, `reference` 37 vs 251, `template` 37 vs 156. The gain comes not from the algorithm but from the corpus: we search the face, not the body.

Vector search, embeddings, and FTS5 are deliberately not used. The reason is the mixed Russian-English corpus and exact identifiers: `REQ-018` and `REQ-008` sit almost next to each other in a vector space, and telling them apart is mandatory.

**Body search (second tier).** A word that occurs only in a body is never found by the
face — the first tier's main gap: an identifier like
`REQ-018` mentioned in someone else's text, or a term from the middle of a section. The second tier
closes this gap without abandoning the philosophy:

1. **Tier 1 — the face**: the existing search unchanged (the same weights, the same
   morphology, the same AND semantics). Behavior is identical to before — no regression.
2. **Tier 2 — the body**: a document where **every** query word was found somewhere
   (in body sections or on the face), but not all of them — on the face. Ranking is BM25
   (k1 = 1.5, b = 0.75) over the document's best section; IDF is computed over documents.
   Section morphology is the same as on the face: an exact word or a prefix minus the last
   character. The hit's anchor is the **best section** `§<heading>:<line>`: it is finer
   than the document anchor.
3. Output: tier 1 first (up to `--limit`), then tier 2 fills the rest. The line
   format is the same — the agent must not have to tell the tiers apart.

A document whose word was found only on the face still passes through the sections: as
a tier-2 hit it gets the anchor of its best section for the remaining words. A document without
a single matching section does not appear at all.

Without `sections.json` (not built, corrupted, `bodySearch: false`) the search
stays face-only — fail-safe, as everywhere in the plugin.

**Why not GraphRAG/LLM.** Graph data is already extracted deterministically (§6:
`links` + resolved `refs`); LLM entity extraction would add
nondeterminism, rebuild cost, and API-key dependence — while
the corpus is already labeled by frontmatter. Tools like graphify parse
the AST deterministically for *code*, but for *documentation* they fall back to an LLM semantic pass —
too expensive and unpredictable for this corpus.

## 8. The hook

**One hook — `Stop`.** No `PostToolUse` and no `state.json`.

Reasons: (1) a staleness mark in `PostToolUse` cannot tell what the agent did from what came in via `git pull` — the "dirty" state becomes session-scoped, and dirt from a past session blocks the next one; (2) the index-vs-disk reconciliation does not depend on the session at all; (3) it catches external changes too, and it does not create `.kbindex/` in foreign repositories.

How it works: the hook reads `.kbindex/index.json`, checks each entry's `hash` against the file's current content, and verifies that the disk holds no new `.md` files missing from the index. A mismatch — the index is stale.

Reconciling all 1796 files in Node — **114 ms** (read + sha1). That is cheaper than any session-scoped logic.

**No index** — no blocking: in a project where the index was never built, the hook is silent. The first build happens on demand: `kb.mjs search` and `kb.mjs map` build the index first when it is absent. A separate `SessionStart` hook is not needed.

**Blocking.** An index-vs-disk mismatch is not a "corpus quality problem" — it is a desynchronization the agent can fix. Blocked with instructions to rebuild. Corpus debt (28 duplicate `id`s, 184 ambiguous links) does **not** trigger a block — it lives in the `audit` report.

**Mechanics.** The working path in this repository is exit 2 + text on stderr (see `hooks/lib/spec-gate.mjs`). Official implementations also use `{"decision":"block","reason":"…"}` (see `hookify/core/rule_engine.py`, `security-guidance/hooks/security_reminder_hook.py`). Exit 2 + stderr is used — it works on all events and matches the repository convention.

**Escape hatch.** At `stop_hook_active: true` (the agent is already continuing because of a previous block) the hook lets the turn pass with a message but does not block — otherwise an infinite loop. The second safeguard is `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` (default 8): after eight consecutive blocks Claude Code force-ends the turn. Our gate blocks once — after `build` the mismatch is gone — so the cap is not reached. But if `build` fails, the gate can hit the cap: the block message must lead the agent to try repairing the index, not to loop.

**Project root.** The hook payload carries no worktree or git-repository marker. The root is `CLAUDE_PROJECT_DIR` when set, otherwise `git rev-parse --show-toplevel` from the `cwd`. For a worktree this yields the worktree root — correct: the index is built in the tree where the agent works.

**Fail-safe.** Any error inside the hook — exit 0. A missing `index.json`, broken JSON, an inaccessible directory — no block.

**Windows.** A `bash` on a path with `&` (e.g. `r&d`) breaks unquoted commands — all calls go through `spawnSync` with an argument array. Paths are normalized: `\` → `/`, an absolute path → relative to the project root. Cyrillic is written as UTF-8 explicitly, not via `print`.

**Untracked files.** The list source is `git ls-files -z --cached --others --exclude-standard '*.md'`: both tracked and new uncommitted files. Plain `git ls-files` would never see a new document — the agent created the file, the index does not contain it, the gate demands a rebuild, the rebuild still does not contain it. The document stays outside the index forever.

## 9. The skill

`skills/kb-index/SKILL.md` — a single instruction to the agent: the map first, then the file.

Triggers: "find the document about …", "where is … documented", "what is there on …", "refresh the index", "rebuild the map".

**The script path** — skill scripts are referenced by relative `<skill-dir>` paths (the
CLI is `<skill-dir>/scripts/kb.mjs`); host variables like `${CLAUDE_PLUGIN_ROOT}` are
forbidden in SKILL.md bodies.

The workflow — search, the directory map, reading from the anchor with a bounded window
(`anchor.chars`), a `build` after an edit — is prescribed with exact commands in
`skills/kb-index/SKILL.md`; that file is the source of the prescribed workflow. The point
of reading from the anchor: without it the agent burns 3137 tokens of a median document
for nothing; with it, exactly the piece it needs.

The skill covers the "gist" where the script could not cope (52 documents without a prose paragraph): the agent writes the first paragraph **into the document body** — exactly where a human looks for the introduction anyway. The plugin stores no texts of its own: the index is a derivative, the source of truth is the project's files. Editing the document body is the only way to improve the gist — and the same edit makes the document better.

The plugin does not require the agent to add fields to the frontmatter of foreign artifacts (the corpus traceability rules forbid it) — the gist lives in the text.

## 10. Portability

The plugin knows nothing about the current repository. It learns the structure at runtime:

- files — from `git ls-files '*.md'` (tracked only: `.claude/worktrees/` copies and junk do not get in), with a filesystem-walk fallback when git is absent;
- metadata — from frontmatter when present, otherwise the document carries an empty `id` and a derived lead;
- hierarchy — from the directory tree, not from a foreign convention: the "directory = section" rule verifies itself (76 of 79 directories with `service` contain exactly one service — agreement confirmed).

Configuration — an optional `.kbindex.json` file at the project root:

```json
{
  "roots": ["docs", "wiki", "architecture"],
  "include": ["*.md"],
  "exclude": ["**/node_modules/**", "**/.git/**", "**/vendor/**"],
  "gistMaxChars": 120,
  "bodySearch": true
}
```

Without a config, the project's entire `git ls-files '*.md'` is indexed.

**Field meanings.** `roots` — which top-level directories feed the index; `include` — which
paths inside them; `exclude` — **privacy**: excluded paths enter the index without a
body (no gist, no anchor, no links — metadata only), so client briefs are visible
in the registry while their text is copied nowhere. Patterns follow `.gitignore` semantics: `*` does
not cross directories, `**` does. `gistMaxChars` — the gist length in a map row.
`bodySearch` — the body tier (§7): `false` turns it off entirely — `sections.json`
receives no sections and the search stays face-only. On by default.

The skill ships with the repository's plugin: `/plugin marketplace add <path>` + `/plugin install specialist@specialist`. Nothing is written to the project except `.kbindex/` and one line in `.gitignore` (with consent).

## 11. Layout

The skill and the hook are part of the repository's single plugin; no separate plugin is created.

```
/
├── hooks/
│   ├── hooks.json                # + a Stop section
│   └── lib/
│       ├── kb-core.mjs           # frontmatter, gist, anchor, resolver, maps, sections, BM25, graph, reconciliation
│       ├── kb-core.test.mjs
│       └── kb-gate.mjs           # Stop: reconcile the index with the disk, force a rebuild
├── scripts/
│   └── kb.mjs                    # CLI: build | search | map | related | path | audit | clean (skills/kb-index/scripts/)
├── skills/
│   └── kb-index/
│       └── SKILL.md
└── docs/
    └── kb-index-design.md        # this document
```

The core is `kb-core.mjs`, pure functions without I/O: the same core is reused by the hook and the CLI, tested with `node --test` and no mocks.

**Portability.** The plugin installs into any project (`/plugin install specialist@specialist`), the skill ships with it. No edits to foreign repositories, except `.kbindex/` in the one where the agent works.

CLI:

| Command | What it does |
|---|---|
| `kb.mjs build` | rebuild `index.json`, `sections.json`, and the maps; prints a quality report at the end |
| `kb.mjs search "<query>"` | two-tier search: the face, then the body with the best section's anchor; builds the index first when absent |
| `kb.mjs map <directory>` | the directory map; builds the index first when absent |
| `kb.mjs related <path\|id>` | a document's neighbors: incoming and outgoing `links` and resolved `refs`; mutual ones first |
| `kb.mjs path <A> <B>` | the shortest chain of documents between A and B over the undirected graph |
| `kb.mjs status` | the index-vs-disk divergence on demand — what a Stop block would say, without blocking |
| `kb.mjs audit` | a report: duplicate `id`s, ambiguous relations, broken links, orphans, dependency cycles, hub documents, stale drafts, documents without a gist or anchor |
| `kb.mjs clean` | remove `.kbindex/` |

`related`/`path` arguments resolve without guessing: exact path → path without
extension → unique `id` → unique slug; an ambiguous match returns
the candidate list and exit code 1.

The quality report is printed at the end of `build` always: it is the measurable claim "the index was built correctly", not a separate command to remember.

## 12. Boundaries and risks

- **The index goes stale silently.** The gate checks `hash`es against the disk — it catches agent edits, `git pull`, and third-party edits alike. But if the agent never reaches `Stop` (the session died), the index stays old — visible via `build`, which prints what changed.
- **Gate false positives.** A document edit does not always need a new gist (a typo fix). The gate asks to "rebuild the index" — a cheap operation; whether "the gist changed" is decided by the agent, not the script. The cost of a false positive is one ~300 ms rebuild.
- **The index-vs-disk reconciliation costs 114 ms** on a 1796-file corpus. On a 20,000-document corpus — about 1.3 s per `Stop`. If that becomes noticeable, reconciliation moves to `mtime` + `size` (30 ms for 1796 files) with a hash only for the changed ones.
- **The map does not replace reading.** The agent may pick the wrong document based on the map. The map provides the anchor; the decision stays with the agent.
- **Third-party texts.** Directories like `context/source-briefs/` are not body-indexed — metadata only; their content is treated as data, not instructions. The list of such directories is set by config, not hard-coded.
- **The plugin changes nothing in foreign files.** The only write to disk is `.kbindex/`; `.gitignore` is edited only with the user's explicit consent.

## 13. The index as an API for other hooks

`index.json` — a stable machine contract with the fields `path`, `id`, `title`, `status`, `service`, `docType`, `gist`, `anchor`, `hash`. Other hooks (including the repository's `spec-gate`) will be able to read it and ask: "is this file indexed", "what is its status", "when was it last updated". The format is versioned by the `"schema": 1` field.

A separate MCP server is unnecessary for this: a hook working in the project reads the file anyway.

## 14. Acceptance criteria

1. `kb.mjs build` on the 1796-document corpus: the index and the maps built in < 3 s; a report printed at the end: how many documents got a gist (the reference **1645**), how many without a gist (**52**), how many with a short gist (**73**), how many with an anchor (**1690**), how many duplicate `id`s (**28**), how many ambiguous relations (**184**), how many unresolved (**0** — there are no unresolved ones; there are ambiguous ones and free text).
2. `kb.mjs search "runbook"` returns ≤ 25 results, all relevant (body grep gives 93, 19% relevant). For "reference" — ≤ 40 (grep: 251). For an inflected-form query — ≥ 30 via the extended morphology match (the exact match alone gave 8).
3. `kb.mjs map <directory>` shows the directory map; a directory with a single document has no map.
4. A document edit → `Stop` detects the `hash` mismatch → blocks with rebuild instructions → after `build` the mismatch is gone. Both an out-of-agent edit (`git pull`) and a new uncommitted file are verified.
5. `kb.mjs audit` finds the same 28 duplicate `id`s and 184 ambiguous relations — what a human would miss.
6. `node --test` green: frontmatter parsing (nested structures, lists, block scalars, quotes — 83 files with nesting on the corpus), the gist from the two sources with quote and table skipping, anchor selection with nesting accounted for, the relation resolver with the "free text is not a link" rule, the index-vs-disk reconciliation, the audit report.
7. The plugin installed in a foreign project without `.kbindex.json` and without git — does not crash, indexes what it can.
8. Bodies are not copied into the index: `sections.json` holds only headings, lines, and term frequencies; `exclude` paths are absent from it entirely (`search "confidential"` over a brief gives "no matches").
9. Body search: a word living only in a body (e.g. `stop_hook_active`) is found with the best section's anchor `§<heading>:<line>`; the tier-1 output on face queries is unchanged from before. `bodySearch: false` returns the search to the face and leaves `sections.json` empty.
10. Graph: `related <doc>` shows incoming and outgoing relations (mutual first, self-links invisible); `path A B` prints the shortest chain with the relation label at each step; an ambiguous `id` returns the candidate list and exit 1, no chain — exit 1.
11. Evolution measurements (the plugin repository, 24 documents): `build` 116 ms, `sections.json` 260 KB (224 sections), search — 67 ms. On the sample corpus (1796 documents), re-verify the §14.1–14.2 figures and the search time with the body tier — the corpus lives in another repository.

## 15. Developer decisions

- The exact `.kbindex.json` format (the field order) — the §4 contract must not change; the field names and their set are fixed.
- How `kb-core.mjs` is split into modules.
- The `search` output format (a table / the `--json` JSON flag).
- Whether a twin pi extension is needed: the repository keeps the logic in `hooks/lib/*-core.mjs` with two wrappers — a Claude Code hook and `extensions/*.ts` for pi. For portability it is better to repeat this scheme, but it can be postponed until pi is confirmed necessary: `pi` is not installed locally, writing blind.

## 16. Work order

1. `kb-core.mjs` + tests — the core, no hooks or CLI.
2. `kb.mjs build|search|map|audit` — the CLI, verified on a live corpus; the quality report is printed and compared against the §14 reference.
3. `kb-gate.mjs` + a `Stop` section in `hooks/hooks.json` — the gate.
4. `skills/kb-index/SKILL.md` — the skill.
5. Registration: `kb-core.test.mjs` into the root `package.json`'s `test` script, the plugin version in `.claude-plugin/plugin.json`, `plugin.json`, `package.json`, and `.claude-plugin/marketplace.json` — in sync, per repository convention. In `package.json` → `pi.skills` the path already points at `./skills`; a new skill is picked up automatically.

Every step leaves a working result: after step 2 the index can already be built by hand and its quality checked, before any hooks are wired.

Repository documentation: `docs/hooks.md` (the hook table) and `docs/skills.md` (the skill descriptions) are updated at step 5 — they list all the plugin's hooks and skills, skipping them is not allowed.

**Evolution 2026-11-14.** The body and the graph on top of the existing index; the §4 contract
untouched (`"schema": 1` unchanged):

1. `kb-core.mjs`: `extractSections`, `sectionTerms`, `buildSections`, `searchWithBody`
   (two-tier), the graph — `buildGraph`, `relatedOf`, `resolveTarget`, `shortestPath`.
2. `kb-fs.mjs`: `writeSections` / `readSections` (compact writing), `bodySearch` in the
   config.
3. `kb.mjs`: `build` writes `sections.json` and prints `sections: N`; `search`
   is two-tier; the new commands `related` and `path`.
4. Tests — into the existing files (create no new ones, `package.json` untouched).
5. `SKILL.md` rewritten: the search → related/path → read-from-section-anchor workflow,
   where the scripts live, a note about the Stop hook (Claude Code only).

**Evolution 2026-11-20.** Search quality, fewer re-reads, a smaller context bill —
no artifact changes, `index.json` and `sections.json` untouched:

1. `didYouMean` in `kb-core.mjs`: an empty result prints the ids and slugs within a
   small edit distance (one edit for words of 3–4 characters, two for longer) — the
   transposed digits of the design's own example, `REQ-081` for `REQ-018`, are the
   exact case. Up to three suggestions; an ambiguous one carries no path (no guessing).
2. `snippetOf` in `kb-core.mjs`: a body hit shows the answering line of its best
   section, read from the file at query time and cut to a window around the query
   word — bodies still live only in the files, never in the index.
3. The `search` output is compact: the first five hits carry the full face (gist or
   snippet), the tail is paths only, the cut announces itself (`… and N more`).
4. `--status` / `--type` / `--service` narrow the corpus before both tiers;
   `--json` on `search`, `map` and `related` is machine output for other hooks
   (the §13 API, now also over the CLI).
5. `related` shows the gist of every neighbour — the follow-up decision without
   opening the neighbour.

**Evolution 2026-11-20 (0.34.1).** The trust audit — everything here reads data the
index already holds:

1. `dependencyCycles` in `kb-core.mjs` and the audit: A → B → C → A over resolved
   relations; markdown links never close a cycle. Each cycle reported once, rotated
   to its smallest node.
2. `hubDocuments`: the most pointed-at documents — the entry points of the corpus,
   the opposite end from the orphans.
3. `kb.mjs status`: the index-vs-disk divergence (`compareIndex`) on demand — the
   gate's verdict without the gate.
4. A body hit is marked `~` in the search output; the default `--limit` is 10.
5. `audit` is now a report object with two renderings — text and `--json`; `path`
   learned `--json` too (steps with relations and directions).

**Evolution 2026-11-20 (0.35.0).** The query language and the weighted graph.
The record gains one field — `aliases` (§4) — everything else is behavior:

1. `parseQuery` in `kb-core.mjs`: a word with a leading `-` must not appear, on the
   face or in the sections (`gate -install`); a lone dash is not a word. Negatives
   never join did-you-mean.
2. `aliases` frontmatter (a list or a string) joins the face with the weight of the
   gist — manual synonyms for "the words of the task differ from the words of the
   document". An excluded document gives them up with the rest of its text.
3. `switchLayout`: did-you-mean retypes a word in the other keyboard layout —
   `ghbdtn-001` is exactly `привет-001`, the classic mixed-layout typo of a
   Russian-English corpus.
4. `shortestPath` is Dijkstra now: a resolved relation costs 1, a markdown link 2 —
   a chain through real dependencies beats a shorter chain through incidental links.
5. `--updated-since <date>` narrows by last-updated, else by the file's modification
   day; `status` reconciles two-stage like the gate (mtime+size, hash only the
   suspects).
6. Stop words of both languages leave `sections.json`; `INDEX_SHAPE_VERSION` rides
   in the config fingerprint, so an incremental rebuild never reuses records of an
   older shape (the `aliases` bump proved the need).
