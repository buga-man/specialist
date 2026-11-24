# Specialist review loop

Run the specialist review pass over the current change set (staged, or the branch diff
against main — ask if ambiguous):

1. `code-review` — run the specialist code-review skill: findings with heart /
   consequences / glue classes, the Not-reviewed line, severities P1–P3.
2. `bug-hunt` — run the specialist bug-hunt skill over the same diff; merge duplicate
   findings, keep the source-kind labels.
3. Triage: P1 blockers first. For a contested verdict, ask the judge model role
   (`@judge`) for a typed decision, citing the finding id and the exact code line.
4. Fix or set aside: fixes go through the normal edit discipline (plan scope, tests next
   to the file under test); set-asides are recorded with a reason, never dropped.
5. Exit only on a converged verdict — no open P1 or P2. If the change shipped
   user-visible behavior, finish with the tech-writer documentation step.
