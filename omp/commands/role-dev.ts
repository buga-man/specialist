/**
 * omp-only slash command /role-dev — the specialist developer role as a native omp
 * command (the same omp-key-only wiring as /role-analyst).
 *
 * The handler returns a string — omp sends it as the user prompt and the turn starts.
 * The text routes into the role-dev skill: the skill stays the single source of the
 * role protocol, the command is only the entry bell.
 */
export default function () {
  return {
    name: "role-dev",
    description: "Specialist: switch to the developer role (plan → implementation → acceptance)",
    execute() {
      return (
        "Load the specialist `role-dev` skill and run it now: adopt the developer role " +
        "for this session. The slash command is the user's explicit consent to switch " +
        "(the dispatch protocol) — if work is already in flight in another role, wrap up " +
        "and record the handover first. Then run the dev protocol: implementation-plan " +
        "before code, spec-implementation discipline against the open plan (edit only the " +
        "open task's Files scope, close tasks with an explicit `- Done:` line carrying the " +
        "verify evidence), test-design for the risky surface — and stay in the role until " +
        "the user switches again."
      );
    },
  };
}
