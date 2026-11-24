/**
 * omp-only slash command /role-qa — the specialist QA role as a native omp command
 * (the same omp-key-only wiring as /role-analyst).
 *
 * The handler returns a string — omp sends it as the user prompt and the turn starts.
 * The text routes into the role-qa skill: the skill stays the single source of the
 * role protocol, the command is only the entry bell.
 */
export default function () {
  return {
    name: "role-qa",
    description: "Specialist: switch to the QA role (test-analysis → test-design → triage)",
    execute() {
      return (
        "Load the specialist `role-qa` skill and run it now: adopt the QA role for this " +
        "session. The slash command is the user's explicit consent to switch (the dispatch " +
        "protocol) — if work is already in flight in another role, wrap up and record the " +
        "handover first. Then run the QA protocol: test-analysis of the change surface, " +
        "test-design with the TEST-ID registry and two-way coverage, defect-triage for " +
        "what the runs surface — and stay in the role until the user switches again."
      );
    },
  };
}
