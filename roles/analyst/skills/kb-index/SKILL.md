---
name: kb-index
description: "Find documentation fast in a large corpus. Use when the user asks where something is documented (\"where is X documented\", \"find the document about …\", \"what is there on …\"), asks for the documents around a topic (\"which documents relate to …\", \"what depends on …\"), or asks to refresh the documentation index (\"refresh the index\", \"rebuild the map\"). Searches the index of document faces (id, title, gist, anchor) first, then the document bodies section by section (BM25), and can walk the graph of links and relations between documents. Never reads whole documents to decide whether they matter."
---

# kb-index

The map of the documentation: an index of document faces, section statistics of
the bodies, and the graph of links between documents.

The scripts live in the skill itself: the CLI is `<skill-dir>/scripts/kb.mjs`.

## How to search

1. Search:

   ```bash
   node "<skill-dir>/scripts/kb.mjs" search "runbook"
   ```

   `<skill-dir>` is the directory of this SKILL.md — the host reports it when
   the skill loads; resolve the path from there.

   The search is two-tier. Hits by the **face** of a document (id, title, gist,
   anchor, path) come first; hits found only in the **body** come after, ranked
   by BM25 over sections. Both matter: a term that lives only in a body — an
   identifier like `REQ-018` mentioned in passing, a term from the middle of a
   section — is found by the second tier.

   Output per hit: `id`, path, anchor (`§<heading>:<line>`), gist line. At most
   20 hits (`--limit <n>` changes that). The anchor of a body hit is its best
   matching section — a finer entry point than the document anchor.

2. Map of a directory — when the request is wider than one document:

   ```bash
   node "<skill-dir>/scripts/kb.mjs" map docs/product/requirements
   ```

3. Read **from the anchor**, not from the top. The anchor is
   `§<heading>:<line>` — the line of the file. Read a window from the anchor;
   the index says how long the section is (`anchor.chars` in `index.json`).
   Do not read a whole document to decide whether it matters.

## How to walk the graph

The index holds the links between documents: markdown links and the resolved
relation fields (`parent`, `depends_on`, `children`, `br`, `us`).

- Neighbours of a document — what it points at and what points at it:

  ```bash
  node "<skill-dir>/scripts/kb.mjs" related "docs/req/REQ-015.md"
  ```

  Arguments resolve to a path, a unique `id` or a unique file slug
  (`related REQ-015` works too). An ambiguous `id` comes back with the list of
  candidates — pick one, do not guess.

- Chain between two documents — the shortest path across the corpus:

  ```bash
  node "<skill-dir>/scripts/kb.mjs" path "REQ-015" "ADR-007"
  ```

  Use it when two documents are related but the middle of the chain is unknown.

## When the document is not in the output

The face tier covers id, title, gist, anchor and path; the body tier covers the
section texts. A miss usually means the wording differs:

- search by the wording of the task, not by the term of the document;
- look at the map of the top-level directory — it lists the subdirectories.

## After editing a document

```bash
node "<skill-dir>/scripts/kb.mjs" build
```

The index is not versioned and lives in `.kbindex/` of the project. The plugin's
gates keep it in sync: in Claude Code and Codex the Stop hook blocks the end of the
turn until the index is rebuilt; in pi a settle-time follow-up demands the same. In
hosts without a gate, run `build` by hand after editing documentation.

## When a document has no gist

Some documents have no meaningful first paragraph — their gist is empty and they look
thin in the output. **Write the lead paragraph into the document itself**, not into
the index: the index is derived, the files are the source of truth. It also makes the
document better for a human reader.

Quality report (documents without a gist, duplicate `id`s, ambiguous relations):

```bash
node "<skill-dir>/scripts/kb.mjs" audit
```

## Configuration

The project may hold a `.kbindex.json` in its root:

```json
{
  "roots": ["docs"],
  "include": ["*.md"],
  "exclude": ["**/source-briefs/**"],
  "gistMaxChars": 120,
  "bodySearch": true
}
```

- `roots` — only these top-level directories are indexed;
- `include` — only the paths that match one of the patterns;
- `exclude` — the paths that are indexed **without their body**: no gist, no anchor,
  no links, no section terms. Use it for the material of the customer — the plugin
  copies nothing of it, neither to `index.json` nor to `sections.json`;
- `gistMaxChars` — how long the gist of a map row may be (120 by default);
- `bodySearch` — `false` turns the body tier off: no section statistics, the
  search stays face-only. On by default.
