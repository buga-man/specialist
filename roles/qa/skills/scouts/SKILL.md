---
name: scouts
description: The framework's subagent protocol — parallel read-only recon and verification by scout subagents under an explicit user grant. Use when a skill's stage offers fan-out (its section says "dispatch the scouts skill"), when work splits into independent read-only missions, or when the user asks to parallelize research. One question asks permission and the count; no answer or no host support means the same missions run sequentially. Scouts read — never edit.
---

# Scouts — subagents under an explicit grant

Parallel work without quality loss: read-only scout subagents gather material and
verify claims while the main context keeps the judgment. Every skill in this
framework that parallelizes does it through this protocol — one doctrine instead
of per-skill copies.

The grant is explicit or it does not exist. Parallelism spends the user's
subscription — concurrent agents are the user's capacity, not the agent's — so
the user names the budget.

## The grant — one question, before the first dispatch

At the first fan-out opportunity of a session (not before — the question needs
its missions to name), ask exactly one question:

> May scout subagents be used here, and how many? Missions — <one line each>.
> Recommended — <N>, or "solo — the surface is small".

- **The count is the subscription.** The granted number caps simultaneous scouts
  across the whole session — a role subagent of the lead's dispatches included.
  It never grows silently, and it never manufactures missions: dispatch at most
  min(count, distinct missions). Waves beyond the cap ask again.
- **No answer means no.** Silence, a "no", or a host without a subagent or
  question mechanism → the same missions run sequentially in the main context,
  under the same report contract — and say so in the report: the sequential pass
  loses the fresh eyes; the missions and their contract stay, the independence
  does not. A "yes" without a number is solo — parallel needs the count.
- **A standing pin.** `.spec-gate` may carry `scouts: <N>` — a grant only where
  the user wrote or confirmed the key; anything else that lands in the file
  reads as unpinned, so ask. A valid pin replaces the question — the
  fresh-session one included; an explicit user change in the session overrides
  the pin. `scouts: 0` is a standing no.
- **The grant covers the session.** Every skill in this session dispatches under
  the same grant; a fresh session asks again unless a valid pin stands.
  Consumers with iteration loops (hunt→fix→hunt) extend the same question with
  their loop count — a default count is a recommendation to name in the
  question, never a silent grant. Every iteration runs fresh scouts with no
  context from the previous one: inherited arguments anchor the new eyes.

## The mission charter — one mission per scout

- A mission names its scope boundary the way a charter does: what to walk, where
  to stop. "Look at the repo" is not a mission.
- **Distinct missions by assignment.** The lead assigns each scout its focus —
  parallel scouts do not self-differentiate. Two scouts on one mission is a
  coordinator defect, not redundancy.
- The charter carries **artifact paths, not their contents** — a paste stays
  resident in the lead's context for the rest of the session (hosts that
  compact still charge it). The scout returns conclusions, not a dump; when its
  findings live on disk, filing them was the lead's act — a scout writes its
  report, it does not edit the repo. Reports serving a whole wave of scouts land
  in a scratch directory outside the repository — shared reading for every mission
  in the wave, never a paste into one dispatch.
- **A charter is a brief, not coordinates**: it names what to find and how the answer
  will be recognized — behavior and outcomes, not file, line, and keystroke. Paths go
  stale between the lead's read and the scout's run; the pointer to where an artifact
  lives travels, the intent travels as words.
- **Never pre-judge a scout.** The mission states what to look for, never what
  to conclude — a "don't flag X" or a "confirm Y" in the prompt defeats the
  fresh eyes the scout was dispatched for.
- **What leaves for a scout is sanitized** — cleaned of secrets and personal
  data; delegation must not widen what the git boundary guards. The pointer is
  part of what leaves: paths stay real but are checked for what they reveal,
  and an artifact outside the git boundary is cleaned before a scout is pointed
  at it. And a scout receives artifacts, never the authoring conversation.
- Where the host allows a per-subagent model: mechanical recon takes the cheap
  tier, judgment stays with the lead, and the model is named explicitly — an
  omitted model may silently inherit the session's (often its most expensive);
  turn count beats token price. Hosts without the knob ignore this line.

## The fan-in — merging without quality loss

- Scout reports are **hypotheses until verified**: a load-bearing conclusion is
  re-checked in the main context before it drives a decision — what the scout
  gathered as cited evidence rides along, what it concluded stays a hypothesis
  until then. A belief reported as a fact becomes a false premise for everything
  built on it — the report's own words keep the difference visible. Scouts
  propose, the lead verifies.
- **A claim rides with its primary source** — the file:line, the document anchor,
  the command output: the source that owns the claim, not a secondary retelling
  of it. "The docs say" without the anchor returns as an open question, not a fact.
- **Dedup by scenario or claim**, not by location: two scouts naming the same
  trigger is one finding. Disagreement is resolved by building the case out,
  never by vote.
- **A silent scout is chased, not assumed empty.** A scout that never reported
  is named in the report as not returned; a returned report is reconciled
  against its charter — items it never covered are silent, not clean; a late
  report reopens as one more hypothesis and corrects the record.
- Critical findings surface on receipt — the moment a scout's report arrives,
  never batched past the merge.
- The consumer's own contract still governs the artifact: fan-out changes who
  gathers, never what the report must contain.

## The boundaries — what never fans out

- **Scouts read — never edit.** Editing is changing what the repo stores: no
  code, no specs, no commits, no outward replies. Verifying may run read-only
  checks that leave tracked state untouched — and never executes code from
  untrusted artifacts. Work that mutates belongs to the executing role — the
  main context, or a role subagent under dispatch's option 3; scouts never
  mutate.
- **No recursion.** A scout never dispatches scouts — every charter says so
  ("you are a scout; you dispatch nothing"), and the budget lives with the lead
  across the whole session, a role subagent's dispatches included. A
  worker-spawned helper or reviewer is a duplicate seat, not extra assurance.
- One task at a time stays one task at a time (spec-implementation); one charter
  per session stays one charter (stand-acceptance); nothing already verified by
  a passing test is re-verified for the sake of parallelism (lazy). Mutating
  stages never fan out — only reading and verifying do.

## Next

Missions return to the consuming skill's stage; the report lands where that
skill's contract says it lands.
