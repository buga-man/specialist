# Vibe-build the open plan

Slice the open plan (docs/plans/*.md — if none is open, ask which plan to run) into
independent work packages and build them with vibe workers:

1. Slice: one package per independently verifiable plan task, P1 before P2 before P3.
   Name the exact files each package touches — packages must not overlap (the spec-gate
   extension blocks out-of-scope edits).
2. Spawn one `vibe_spawn` worker per package (`cli: "good"` → the @task model) with a
   prompt that carries: the task text verbatim, its acceptance criteria, the exact
   `Verify:` commands, and the instruction to close its task with an explicit `- Done:`
   line plus the evidence. Workers have full tools; the director stays read-only — keep
   write work in the workers.
3. Collect with `vibe_wait` / `vibe_list`. Reconcile the plan document yourself — workers
   must not edit the plan, only their files.
4. Acceptance in the main session: run the plan's `Verify:` commands; anything red goes
   back to a worker or back to the plan — never silently green.

Finish with the standard specialist acceptance (spec-review → stand-acceptance) before
declaring done.
