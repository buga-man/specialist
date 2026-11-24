/**
 * omp-only slash command /dispatch — the specialist classifier/router as a native omp
 * command (the same omp-key-only wiring as the role commands).
 *
 * The handler returns a string — omp sends it as the user prompt and the turn starts.
 * The text routes into the dispatch skill: the skill stays the single source of the
 * routing protocol, the command is only the entry bell.
 */
export default function () {
  return {
    name: "dispatch",
    description: "Specialist: classify the current task and route it to a role",
    execute() {
      return (
        "Load the specialist `dispatch` skill and run it now: classify this session's " +
        "current task into a role (analyst / dev / qa), announce the role, and either " +
        "continue in place or propose the switch, the role subagent, or parking the task " +
        "for the other role — exactly per the dispatch protocol. If no task is on the " +
        "table yet, ask for it first."
      );
    },
  };
}
