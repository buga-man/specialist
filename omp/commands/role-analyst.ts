/**
 * omp-only slash command /role-analyst — the specialist analyst role as a native omp
 * command. Wired only through the package.json "omp" key's commands list: no other
 * host's manifest references this file, and no other host scans omp/commands.
 *
 * The handler returns a string — omp sends it as the user prompt and the turn starts.
 * The text routes into the role-analyst skill: the skill stays the single source of the
 * role protocol, the command is only the entry bell.
 */
export default function () {
  return {
    name: "role-analyst",
    description: "Specialist: switch to the analyst role (brainstorm → spec → decomposition)",
    execute() {
      return (
        "Load the specialist `role-analyst` skill and run it now: adopt the analyst role " +
        "for this session. The slash command is the user's explicit consent to switch " +
        "(the dispatch protocol) — if work is already in flight in another role, wrap up " +
        "and record the handover first. Then start the analyst protocol: brainstorm the " +
        "request into a spec with bilingual requirement markers ((must)/(обязательно) " +
        "blocking, (should)/(желательно) negotiable) and EARS-shaped acceptance criteria, " +
        "and stay in the role until the user switches again."
      );
    },
  };
}
