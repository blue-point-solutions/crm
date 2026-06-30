# Agent bootstrap prompts

Paste one of these into the Claude Code session **on the target machine**, after
running `scripts/bootstrap-machine.sh <MACHINE_ID>`. Replace `<MACHINE_ID>` with
that machine's id (M1 / M2 / M3 — one per machine, never reused).

---

## A. Single-cycle prompt (does ONE ticket, then stops)

```
You are CRM build agent <MACHINE_ID> (run: export CRM_MACHINE_ID=<MACHINE_ID>).
Repo: blue-point-solutions/crm at ~/projects/crm; platform library at
~/projects/library (sibling). Read AGENTS.md and follow the §1 work loop exactly,
honoring the §2 conflict rules. Use library/PACKAGES.md (not a package scan) to
find reusable code. Do ONE Ready ticket: sync main, list `status:ready`, claim the
top one and VERIFY the claim (yield on a lost race), branch, build strictly in
scope with tests, open a PR that `Closes` the issue, self-merge only on green CI,
then mark it Done and unblock dependents. Never push to main. If nothing is Ready
or anything is ambiguous, comment and stop rather than guessing.
```

## B. Continuous prompt (keeps claiming tickets) — recommended

Run via the `/loop` skill so the agent repeats the loop on its own:

```
/loop You are CRM build agent <MACHINE_ID> (export CRM_MACHINE_ID=<MACHINE_ID>).
Repo blue-point-solutions/crm (~/projects/crm), library at ~/projects/library.
Follow AGENTS.md §1 work loop and §2 conflict rules. Each cycle: sync main; pick &
VERIFY-claim the top `status:ready` ticket (yield on lost race); branch; build in
scope + tests; PR `Closes #N`; self-merge on green CI; mark Done; unblock
dependents. Reuse via library/PACKAGES.md. Never push to main. If no Ready tickets
remain, say so and end the loop. If a ticket is `needs-review`, don't self-merge.
```

Let `/loop` self-pace (omit an interval) so it waits sensibly between cycles.

---

## Pre-filled examples
- Machine **M2**: replace `<MACHINE_ID>` with `M2` in A or B above.
- Machine **M3**: replace `<MACHINE_ID>` with `M3`.

## Notes
- Only **#1 (architecture lock)** is claimable at first; the first machine does it,
  then the rest of Phase 1 unblocks and machines fan out.
- The agent self-identifies by `CRM_MACHINE_ID`; claims are tracked by the
  `claimed:<id>` label + a `🤖 CLAIM <id> <ts>` comment (see AGENTS.md §1b).
- Enforcement of "PR-only / green-before-merge / no push to main" is procedural
  (this private repo's plan has no branch protection) — the agent must self-gate.
