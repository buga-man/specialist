---
name: tech-writer
description: Keep documentation in sync with code and build the end-user manual. Two modes, usually run together after a merge or before a release. Spec audit — use when the user asks to check spec consistency, sync specs with code, or find undocumented changes — compares specs against the code since the last audit and proposes amendments; the user approves, nothing is applied silently. User manual — use when the user asks to build or update a user guide — turns approved business specs into a standalone HTML + PDF with screenshots taken from the live stand. Documentation-side counterpart of spec-review — it reports and proposes; it does not fix code and does not review acceptance.
---

# Tech writer

Documentation maintenance for the spec pipeline: keep the specs truthful about the code
and turn the approved specs into a user manual. Two modes; the normal cycle runs both in
order — audit first, so the manual is built from specs that are true right now.

```
merge / release
      │
      ▼
1 spec audit ── findings + ready amendment texts → user approves → amendments applied
      │
      ▼
2 user manual ── business specs + live-stand screenshots → docs/manual (md → html + pdf)
```

Each mode also runs on its own. The writer never fixes code (the pipeline owns code) and
never reviews acceptance (spec-review owns that).

## Mode 1 — Spec audit

### 1. Find the sync point

- The latest report in `docs/audits/` records the hash of the last audited commit —
  start from it.
- No report yet → last release tag (`git describe --tags --abbrev=0`) or the start of
  the available history; confirm the range with the user if the repo is large.

### 2. Collect drift candidates

- `git log` / `git diff <sync-point>..HEAD` over production code (not docs, not tests
  alone): new or changed endpoints, UI screens, business rules, config, permissions,
  scheduled jobs, removed features.
- Test names count as behavior claims too — a renamed test often means renamed behavior.

### 3. Verify against the specs

The feature chain is one glob: `ls docs/specs/*<topic>*`. Verdicts per candidate:

- **undocumented** — code behavior with no spec behind it;
- **stale claim** — the spec asserts something the code no longer does (a named endpoint,
  file, screen, rule);
- **orphan amendment** — an approved Amendment never reflected downstream (e.g. in the
  manual);
- **unowned feature** — a significant feature with no spec chain at all;
- **broken trace** — `parent`/`children` metadata desynced along the chain (a child missing
  from its parent's `children`, a dangling `children` entry);

Every verdict carries evidence: file and line, or an observed behavior. "Looks outdated"
is not a verdict — same bar as spec-review.

### 4. Report, then apply after approval

- Save the report as `docs/audits/YYYY-MM-DD-doc-sync.md`: the commit range, verdicts
  with evidence, and for each finding a ready-to-paste amendment text.
- End the report with a cycle-times table: per completed chain — plan date → review
  date in days, derived from the slug file names (the same derivation as spec-review's
  cycle line, aggregated). A metric that costs no state: if acceptance starts taking
  longer, the table shows it before anyone complains.
- **Review memory → CODESTYLE:** collect the `Recurring:` lines from the `*-quality`
  and `*-audit` reports in the audited range; a finding class recurring in two or more
  reports is a candidate anti-pattern — propose a ready-to-paste rule for
  `CODESTYLE.md`'s Anti-patterns section (evidence: the findings' `file:line`s),
  applied only after the user's approval. That loop — review findings become
  conventions, conventions teach the executors — is how a finding class dies out
  instead of recurring forever.
- **Review report card:** per review report in the range — findings by class and
  severity, plus the re-verification counts (`closed / not closed / regressions`)
  where a successor report exists. The confirmation rate (closed ÷ re-verified) is the
  review's own metric: a rate stuck low means findings do not survive — either the
  fixes are cosmetic or the hunt cries wolf; a class that keeps regressing means the
  fixes treated the symptom.
- Present the findings to the user. Approved amendments go into the owning spec's
  **Amendments** section — the writer proposes, the user approves, nothing is silent.
  Unowned features go back upstream: the user decides between a brainstorm run and
  documenting them directly.
- Record the last audited commit hash in the report — it is the next run's sync point.

## Mode 2 — User manual

### 1. Assemble the content

- The audience is the end user, not a developer: chapters per feature from the business
  specs; within a chapter, each business case (actor → action → outcome) becomes a
  step-by-step how-to with the expected result.
- Code is used only to verify behavior, never as a text source. No file paths, module
  names, or internal terminology in the manual.
- Sources of truth: approved specs and live observation. Anything neither confirms is
  marked `[draft: unconfirmed]` and listed as an open question — the manual never states
  behavior nobody verified.

### 2. Screenshots

- Capture from the live dev stand via the host's browser automation (stand login — see
  stand-acceptance): navigate to the prepared state (synthetic data, the exact screen the
  step describes) → screenshot → PNG into `docs/manual/assets/` with a meaningful
  filename. Alt text is mandatory.
- If the stand or browser automation is unavailable, still write the image tag with its
  alt text and mark the section `**[screenshot: pending]**` — the build renders missing
  images as visible placeholders. Never invent or fake a screenshot.
- Dev stand with synthetic data only — never production, never real personal data.

### 3. Sources and build

Layout in the target repository:

```
docs/manual/
  manual.md          source: front matter (title/version/date), chapters are H1 sections
  assets/*.png       screenshots
  manual.html        build output (committed)
  manual.pdf         build output (committed)
```

Manual source format:

```markdown
---
title: User manual
version: v1.4.0            # release tag
date: 2026-11-08
---

# <Chapter = feature>       each H1 is a chapter, starts a new page in the PDF

## <Scenario = business case>
1. Step — the user's action.
   ![<what the screenshot shows>](docs/manual/assets/<meaningful-name>.png)  — or `**[screenshot: pending]**` until taken
2. Next step. Expected result: ...
```

Build with the skill's script (no dependencies beyond Node and a Chrome-family browser):

```bash
node <skill-dir>/scripts/build-manual.mjs docs/manual            # html + pdf
node <skill-dir>/scripts/build-manual.mjs docs/manual --no-pdf   # html only
```

<skill-dir> is the directory of this SKILL.md — the host reports it when the skill loads; resolve the path from there.

- The HTML is standalone — CSS and images inlined, one file, opens anywhere, can be
  emailed as is. The PDF is printed by headless Chrome/Edge (auto-detected, override
  with `MANUAL_BROWSER`). Exit code 2 means the HTML is built but the PDF was skipped
  (no browser found); exit code 3 means the browser was found but the PDF was not
  created. Report both, do not hide them.
- Verify the result before handing over: cover, TOC links, images, page breaks. Broken
  build output is not a deliverable.
- Known limit: the PDF TOC has no page numbers (Chrome print); the HTML TOC carries links.

### 4. Update an existing manual

- Diff by chapter against the previous version — amend, do not rewrite from scratch.
- Version the manual by release tag; keep the changelog at the top of the manual
  (what changed since the previous version, which audits and amendments fed it).

## Rules

- **Propose, never apply silently** — amendments only after user approval, via the
  Amendments section of the owning spec.
- **Evidence or it is not a finding** — every audit verdict cites a code location or an
  observed behavior.
- **The manual describes verified behavior only** — spec-approved or observed live;
  anything else is marked, not invented.
- **Audience discipline** — the manual is for users: no internal names, no code paths.
- Write all content in the team's working language, which may differ from the language
  of this skill.
