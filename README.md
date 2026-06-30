# CRM

CRM Mobile App for Blue Point Solutions — contact management with a business-card
OCR scanner, deal pipeline, email campaigns, reminders, reports, offline sync,
and team mode. Built on the platform **library** (`rinehardramos/library`).

- **Requirements:** the client requirements doc is **not tracked here** (it's a client document). It's provided to machines out-of-band as context; the buildable scope lives in the **issues/tickets** + `AGENTS.md`.
- **How this is built (multi-agent protocol):** [`AGENTS.md`](AGENTS.md) — **read this first if you are an agent.**
- **Add a machine to the fleet:** [`docs/MACHINE-BOOTSTRAP.md`](docs/MACHINE-BOOTSTRAP.md) · prompts in [`prompts/agent-bootstrap.md`](prompts/agent-bootstrap.md)

## Topology
Built by multiple Claude agents on separate machines in parallel, coordinated via
the org Project **"CRM Build"** and GitHub issues. Clone this repo and the library
as siblings:

```
~/projects/library   # rinehardramos/library (platform-* packages; editable path deps)
~/projects/crm       # this repo
```

Reusable code: check [`library/PACKAGES.md`](https://github.com/rinehardramos/library/blob/main/PACKAGES.md)
before building — much of the CRM (auth, tenancy, quota, deal pipeline via
platform-tracking, storage, qr, notifications…) reuses existing packages.
