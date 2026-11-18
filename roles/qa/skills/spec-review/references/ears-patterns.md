# EARS patterns for acceptance criteria

Mirror of brainstorm's `references/ears-patterns.md` (the analyst role ships the
original) — kept beside the reviewer so the quality bar travels with the qa role
even when the analyst plugin is not installed.

EARS (Easy Approach to Requirements Syntax) gives each acceptance criterion a
fixed grammatical shape, so a reviewer or a fresh-context agent can parse it
without guessing. Pick the pattern that matches the *trigger*, not the
importance — importance is the must/should mark, shape is this.

## Quick selector

```
Is there a trigger event?        → event-driven
Is there an ongoing state?       → state-driven
Are you forbidding behaviour?    → unwanted
Does it always apply?            → ubiquitous
Is it nice-to-have?              → optional
Is it about errors/failures?     → error
```

## Patterns

### 1. `event-driven` — reaction to a stimulus

**Use when:** the response depends on a concrete trigger (request, timer, message).

**Stem:** `When <trigger>, the system shall <response>.`

Example: "When a client requests the health endpoint, the system returns HTTP 200
with `{ "status": "ok" }` within 50 ms."

### 2. `state-driven` — behaviour while a condition holds

**Use when:** the behaviour is conditional on a persistent state.

**Stem:** `While <state>, the system shall <behavior>.`

Example: "While the database connection is unhealthy, the system serves cached
responses with a stale-data warning header."

### 3. `unwanted` — prohibition

**Use when:** you are nailing down what the system must NOT do.

**Stem:** `If <condition>, then the system shall <forbidden response>.`

Example: "If the request lacks an auth token, the system does not return user
data or indicate whether the user exists."

### 4. `ubiquitous` — always-true property

**Use when:** the requirement applies in every state and under every event.

**Stem:** `The system shall <property>.`

Example: "The system logs every state transition with a timestamp and the actor
id."

### 5. `optional` — desirable but not required

**Use when:** the behaviour is a nice-to-have. The word "should" is mandatory
here and forbidden elsewhere.

**Stem:** `Where <context>, the system should <behavior>.`

Example: "Where the user has not interacted for 30 seconds, the system collapses
the side panel."

### 6. `error` — failure-mode handling

**Use when:** describing recovery, retries, or fault tolerance.

**Stem:** `If <error>, then the system shall <recovery>.`

Example: "If the upstream payments API times out, the system retries up to 3
times with exponential backoff and returns HTTP 503 to the caller."

## Heuristics for picking

- A sentence starting with "When" (positive trigger) → `event-driven`.
- "While" → `state-driven`.
- "If" + negation or "shall not" → `unwanted`.
- No trigger, just a property → `ubiquitous`.
- "should" instead of "shall" → `optional`.
- "If <something fails>" + recovery → `error`.

## Verification mapping (the default suggestion for the criterion's `Verify:`)

| Pattern | Suggested verify |
|---|---|
| `event-driven` | integration test |
| `state-driven` | integration test |
| `unwanted` | unit test |
| `ubiquitous` | static analysis or code inspection |
| `optional` | manual observation |
| `error` | integration test with fault injection |

## The quality bar — run over every must criterion before writing it down

Grammar (the patterns above) is necessary, not sufficient. A criterion that
passes this bar drives the implementation; one that does not, decorates the spec:

- **The fail test.** If no implementation could fail this criterion, it is not a
  criterion — delete it or sharpen it until something concrete can fail it.
- **Discriminating power.** A plausible *wrong* implementation must fail it. Name
  that wrong implementation when it is obvious ("a check that only verifies the
  event kind, not the payload, must fail") — this is what separates a criterion
  from a smoke check.
- **One observable outcome.** Two behaviours in one criterion double-count and
  can conflict — split along the single axis being observed.
- **Measurable vocabulary.** Every subjective word carries a number, an example,
  or an oracle. "Fast", "user-friendly", "robust", "handles properly" without an
  anchor are banned; "within 50 ms", "returns HTTP 503", "logs with the actor id"
  are criteria.
- **Defined terms only.** A domain term used in a criterion must be defined in the
  spec (Glossary or the section that introduces it) — a criterion built on an
  undefined term is unverifiable no matter how well it is shaped.
- **Behaviour, not mechanism.** Criteria state what is observed, never how it is
  built — unless the mechanism itself is the requirement (a constraint, named as
  such in Constraints).
- **Examples beat prose.** When a behaviour is subtle, pin the criterion with a
  2-3 row example right under it (input → expected outcome). Examples are the
  contract an implementer cannot misread.

## Anti-patterns

- Multiple behaviours in one criterion — split it.
- The trigger buried in a long sentence — surface it up-front.
- "should" in a non-optional criterion.
- "shall not" in a non-`unwanted` criterion — negation belongs to `unwanted`.
- A criterion with no observable outcome — if nobody can check it, it is a
  wish, not a criterion.
- A criterion that restates the solution ("the system shall use cache X") —
  mechanism in behaviour's clothing; move it to Constraints or delete it.

## Worked sharpening — from wish to criterion

Start with a sentence that feels reasonable and is worthless as a criterion:

> "The system shall handle file uploads properly."

Walk the bar:

- **Fail test**: nothing concrete can fail this — rewrite.
- **Vocabulary**: "properly" is banned — name the actual outcomes.
- **Trigger**: is there one? Upload → `event-driven`.
- **Behaviour, not mechanism**: nothing mechanical here — good.
- **Verify**: pick the command that will decide it.

Final:

> 1. When a client uploads a file larger than 100 MB, the system shall reject it with
>    HTTP 413 and a message naming the limit, without storing any bytes. (must) —
>    Verify: `pytest tests/upload_limit.py -k oversized` → exit 0
>
>    | input            | expected                     |
>    |------------------|------------------------------|
>    | 200 MB file      | HTTP 413, no bytes stored    |
>    | 99 MB file       | HTTP 201, bytes stored       |
>
> 2. While the storage backend is unavailable, the system shall queue uploads and
>    deliver them when it recovers. (should)

Notice what the walk changed: the trigger surfaced, the outcome became a pair of
observable facts (status code + storage side effect), the boundary turned into an
example table, and a command now decides the criterion. Nobody can read the final
version and implement it differently without the difference showing in a test.
