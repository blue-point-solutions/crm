# CRM — Data Model (LOCKED for Phase 1; forward-looking for 2–4)

Postgres. Tenant-scoped throughout (`tenant_id` = a team; a personal account is a
single-member tenant — see platform-tenancy). Users/sessions/oauth come from
**platform-core** migrations; tenancy from **platform-tenancy**. Tables below are
CRM-owned.

## contacts  (platform-contacts; Phase 1)
| col | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | text not null | team/owner scope |
| first_name, last_name | text | |
| job_title, company | text | |
| emails | text[] | 0+ ; dedup key |
| phones | text[] | 0+ E.164-ish ; dedup key |
| website | text | |
| socials | jsonb | {linkedin, facebook} |
| source | text | BNI/event/referral… |
| tags | text[] | Client/Prospect/Partner/Vendor… |
| status | text | lead \| active \| inactive |
| notes | text | |
| follow_up_at | timestamptz | reminder (Phase 2 push) |
| favorite | bool default false | VIP |
| card_image_key | text | platform-storage object key |
| created_at, updated_at | timestamptz | |
| revision | int | optimistic lock |

Indexes: `(tenant_id)`, `(tenant_id,status)`, `(tenant_id,source)`, GIN on `tags`,
GIN on `emails`/`phones` for dedup lookups. Completeness = computed, not stored.

## contact_activities  (platform-activity; Phase 1 = notes/log, Phase 3 = campaigns)
| col | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| entity_type | text | 'contact' \| 'deal' |
| entity_id | uuid | |
| kind | text | note \| call \| email \| meeting \| reminder \| campaign \| system |
| actor | text | user id hash |
| payload | jsonb | freeform per kind |
| at | timestamptz | append-only |
Index: `(tenant_id, entity_type, entity_id, at desc)`.

## deals  (platform-deals over platform-tracking; Phase 2)
The pipeline **state** lives in a `platform_tracking` Job (pipeline
Lead→Qualified→Proposal→Negotiation→Closed Won/Lost; `Job.history` = stage
activity). This table holds deal-specific fields keyed to the tracking job:
| col | type | notes |
|---|---|---|
| id | uuid pk | = tracking job id |
| tenant_id | text | |
| contact_id | uuid | fk contacts |
| title | text | |
| value | numeric | |
| currency | text | |
| expected_close | date | |
| priority | text | low/med/high |
Pipeline rollups (value, by-stage, win/loss) are computed from tracking + this.

## campaigns / templates / sends  (platform-campaigns; Phase 3)
Sketch: `campaigns(id, tenant_id, template_id, segment_query, scheduled_at,
status)`, `templates(id, tenant_id, subject, blocks jsonb)`, `campaign_sends(id,
campaign_id, contact_id, sent_at, opened_at, clicked_at, unsubscribed)`,
`suppressions(tenant_id, email, reason)`. Open/click via platform-webhooks.

## card images  (platform-storage-r2 + platform-image-meta; Phase 1)
Binary in R2 (`derive_object_key(tenant, "cards", uuid)`); `contacts.card_image_key`
references it. Image `content_hash` (platform-image-meta) used for exact-dup
detection; contact-level dedup (same person) is platform-contacts logic.
