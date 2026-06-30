# Machine Bootstrap — joining the CRM build fleet

How to bring a new machine online as a CRM build agent. Each machine works tickets
in parallel per [`AGENTS.md`](../AGENTS.md).

## Prerequisites (install once per machine)
- **git**, **GitHub CLI** (`gh`), **Python 3.12+**, **curl**.
- For frontend tickets only: **Node 20+** (React Native / RN-Web).
- **Claude Code** running on the machine (local, or via remote-control).
- The shared **rinehardramos** GitHub token authenticated:
  `gh auth login`  (or `export GH_TOKEN=…`). It needs `repo` + `project`.

## Pick a MACHINE_ID
One unique id per machine — `M1`, `M2`, `M3`, … Never reuse another machine's id.
Record it in the roster on issue #1 (architecture lock).

## One-liner setup
On a fresh machine that already has `gh` authed:

```bash
gh repo clone blue-point-solutions/crm ~/projects/crm \
  && bash ~/projects/crm/scripts/bootstrap-machine.sh M2
```

This clones the **library** and **crm** repos as siblings under `~/projects`
(the editable `platform-*` path deps require this layout), installs `uv` if
missing, wires `gh` as the git credential helper, and records the machine id.

```
~/projects/library   # rinehardramos/library  (platform-* packages)
~/projects/crm       # blue-point-solutions/crm
```

Override the location with `CRM_PROJECTS_DIR=/path bash scripts/bootstrap-machine.sh M2`.

## Start the agent
In the Claude Code session on that machine:

```bash
export CRM_MACHINE_ID=M2
```

Then paste a prompt from [`prompts/agent-bootstrap.md`](../prompts/agent-bootstrap.md):
- **B (continuous, recommended)** — wraps the work loop in `/loop` so the agent
  keeps claiming and shipping tickets until none are Ready.
- **A (single-cycle)** — does one ticket and stops (good for a first dry run).

## What happens
1. Only **#1 (architecture lock)** is `status:ready` initially → the first agent
   claims and completes it (freezes schema/package-boundaries/API + finalizes the
   Phase-1 breakdown).
2. On #1 merge, its dependents unblock (`status:ready`) and the fleet fans out —
   library packages (`platform-contacts`, `platform-ocr-cards`, …) are separate
   directories, so machines rarely touch the same file.
3. Each agent loops: claim → verify → branch → build → PR → green CI → squash-merge
   → unblock dependents.

## Operating notes
- **Identity & claims:** `CRM_MACHINE_ID` + the `claimed:<id>` label + a CLAIM
  comment. Races resolve by earliest-timestamp / smallest-id (AGENTS.md §1b).
- **Never push to `main`** — branch-per-ticket + PR + green CI + squash-merge.
  (Procedural: this private repo has no branch protection on the current plan.)
- **Idle:** if no Ready tickets, the agent reports and stops/sleeps. Re-running the
  loop later picks up newly-unblocked tickets.
- **Stuck/blocked:** comment the blocker, set `status:blocked`, unclaim, move on.
