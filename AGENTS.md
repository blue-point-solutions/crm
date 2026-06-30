# CRM Build — Multi-Agent Coordination Protocol

This repo is built by **multiple Claude agents on separate machines, in parallel**.
Every agent MUST follow this protocol exactly. Its job is zero double-work, zero
merge conflicts, zero regressions.

Tracking board: **blue-point-solutions → Project "CRM Build"**. Tickets are GitHub
issues in this repo. Reusable code lives in the platform **library**
(`rinehardramos/library`).

---

## 0. One-time setup (each machine)

```bash
# Clone the library and this repo as SIBLINGS (editable path deps expect ../../../library):
#   ~/projects/library   (rinehardramos/library)
#   ~/projects/crm       (blue-point-solutions/crm)
export CRM_MACHINE_ID=M1        # MUST be unique per machine: M1, M2, M3…
gh auth status                  # shared rinehardramos token; never push to main directly
```

Your `CRM_MACHINE_ID` is your identity for the whole protocol. Pick it from the
roster in issue #1 and never reuse another machine's id.

---

## 1. The work loop (repeat forever)

```
sync main → pick a READY ticket → CLAIM (+verify) → branch → build → PR → green CI → squash-merge → unblock dependents → repeat
```

### 1a. Find a ticket
Only ever work a ticket that is **Ready** = Project Status `Ready` AND label
`status:ready` AND every `Depends-On` issue is **Done**. Never claim `Blocked` or
a ticket with an open dependency.

```bash
gh issue list --repo blue-point-solutions/crm --label status:ready --state open \
  --json number,title,labels --jq 'sort_by(.number)'
```
Prefer lowest Phase, then highest Priority, then lowest issue number. Skip any
ticket already carrying a `claimed:*` label.

### 1b. CLAIM (optimistic) — then VERIFY (resolve races)
GitHub has no lock, so claim then check for collisions:

```bash
N=<issue>; TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh label create "claimed:$CRM_MACHINE_ID" --repo blue-point-solutions/crm \
  --color ededed --description "Claimed by $CRM_MACHINE_ID" --force >/dev/null 2>&1  # labels must pre-exist
gh issue edit $N --repo blue-point-solutions/crm \
  --add-label "claimed:$CRM_MACHINE_ID" --remove-label status:ready --add-label status:in-progress
gh issue comment $N --repo blue-point-solutions/crm --body "🤖 CLAIM $CRM_MACHINE_ID $TS"
# set Project Status=In Progress, Agent=$CRM_MACHINE_ID  (see §4)

sleep $(( ( $(echo -n $CRM_MACHINE_ID | cksum | cut -d' ' -f1) % 8 ) + 4 ))   # 4–11s jitter
```
Re-read the issue's `claimed:*` labels and CLAIM comments. **If two machines
claimed: the earliest CLAIM timestamp wins; on a tie, the lexicographically
smallest `CRM_MACHINE_ID` wins.** If you lost:

```bash
gh issue edit $N --repo blue-point-solutions/crm --remove-label "claimed:$CRM_MACHINE_ID" \
  --remove-label status:in-progress --add-label status:ready
gh issue comment $N --repo blue-point-solutions/crm --body "🤖 YIELD $CRM_MACHINE_ID (to <winner>)"
```
Then go back to 1a and pick the next ticket. If you won, proceed.

### 1c. Branch & build
```bash
git fetch origin && git checkout main && git pull --ff-only
git checkout -b crm/$N-<short-slug>
```
- **Stay strictly in the ticket's scope.** One ticket = one concern = one PR.
- Reuse the library first (read `library/PACKAGES.md` / `catalog/catalog.json` —
  do NOT re-read 47 packages). If you create a new `platform-*` package, it MUST
  ship a `[tool.platform.catalog]` entry (CI enforces it).
- Add tests. Run local gates before pushing: `ruff`, `mypy --strict`, unit tests,
  and `python scripts/catalog.py check` (if you touched the library).

### 1d. PR
```bash
git pull --rebase origin main        # ALWAYS rebase on latest main before pushing
git push -u origin crm/$N-<slug>
gh pr create --repo blue-point-solutions/crm --base main \
  --title "<type>(<area>): <summary> (#$N)" --body "Closes #$N

## What / why
## How verified (ruff, mypy, tests; note anything needing Postgres/device)
## Scope: only #$N"
```

### 1e. Merge (self-merge on green)
- Wait for **required CI to pass**. Never merge red. Never merge with an
  unresolved rebase conflict.
- `gh pr merge --repo blue-point-solutions/crm --squash --delete-branch`.
- If a ticket is labeled `needs-review`, do NOT self-merge — request a second
  machine and wait for approval.

### 1f. Close out & unblock
On merge: set Project Status=Done, remove `claimed:*`/`status:*` working labels,
comment `🤖 DONE $CRM_MACHINE_ID`. Then for each ticket that `Depends-On` this one:
if all its dependencies are now Done, set it `status:ready` + Project Ready.

---

## 2. Conflict & regression rules (non-negotiable)

1. **Architecture is locked before feature work.** Issue #1 (architecture-lock)
   freezes the stack, DB schema, package boundaries, and API contracts. It blocks
   all feature tickets. Do not design around it — if it's wrong, raise an issue.
2. **Prefer isolated units.** Build reusable logic as **separate library packages**
   (own directory) + thin app wiring. Two tickets touching the same file is the
   main conflict source — avoid it by package isolation.
3. **Never claim a ticket with an unmet `Depends-On`.** This prevents building on
   foundations that don't exist yet (the brief's ■-dependencies).
4. **Never push to `main`.** Branch-per-ticket, PR, CI-gated squash-merge only.
5. **Rebase on `main` immediately before pushing** and re-run gates; resolve any
   conflict locally — never force a merge.
6. **Hotspot files** (the FastAPI app/router registration, the alembic migration
   chain, shared `__init__` exports) are labeled `hotspot` on their tickets and
   are worked **one at a time** — claim implies an exclusive lock on that hotspot;
   if another hotspot ticket is `in-progress`, pick something else.
7. **CI is the regression gate — `main` is branch-protected.** Direct pushes to
   `main` are blocked, a PR is required to merge, and force-pushes/deletions are
   off. Required CI status checks are added once CI exists (architecture-lock
   ticket). You still self-merge only on **green** CI; if your change reddens
   `main`, you own the immediate fix.

---

## 3. When things go wrong
- **Lost a claim race** → yield (§1b), pick another ticket.
- **CI red on your PR** → fix on the branch; if blocked >30 min or out of scope,
  comment the blocker, set `status:blocked` + `blocked` label, unclaim, move on.
- **Rebase conflict you can't cleanly resolve** → comment, `status:blocked`,
  unclaim; flag the conflicting ticket pair so a human/owner serializes them.
- **Discover a ticket is mis-scoped / wrong dependency** → comment, don't silently
  expand scope; open a new ticket or fix the Depends-On, don't bulldoze.
- **No Ready tickets** → idle: re-sync, check for tickets you can unblock by
  finishing review, else stop and report.

---

## 4. Project board commands (Projects v2)
The board is org-level ("CRM Build"). Status/Agent are set via `gh project item-edit`
(IDs discoverable with `gh project item-list --owner blue-point-solutions <num>`).
If the Projects CLI is unavailable on a machine, the **labels are the source of
truth** for the work loop (status:* + claimed:* + depends drive everything); the
board is a mirror. Keep labels correct first.

---

## 5. Definition of Done (per ticket)
Scope met · tests added & passing · ruff + mypy --strict clean · `catalog check`
green (if library touched) · PR `Closes #N` · required CI green · squash-merged ·
board=Done · dependents unblocked.

---

## 6. Bootstrap prompt (give this to each machine's agent verbatim)

> You are **CRM build agent `<MACHINE_ID>`** (set `CRM_MACHINE_ID=<MACHINE_ID>`).
> The repo is `blue-point-solutions/crm`, cloned at `~/projects/crm` with the
> platform library at `~/projects/library` (sibling). **Read `AGENTS.md` in the
> repo root and follow the work loop in §1 exactly**, honoring the conflict rules
> in §2. Use `library/PACKAGES.md` to find reusable code (don't re-scan packages).
> Claim one Ready ticket at a time, verify the claim, branch, build in scope, open
> a PR that `Closes` the issue, self-merge only on green CI, then unblock
> dependents and repeat. Never push to `main`. Start by syncing `main` and listing
> `status:ready` tickets. If anything is ambiguous, comment on the ticket and pick
> another rather than guessing.
