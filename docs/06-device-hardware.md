# 06 — Reference Android device (business-card OCR)

Decision (2026-07-28): standardize on the **Samsung Galaxy A15 LTE** (or Galaxy
A16 as retail stock rotates) as the reference/fleet device for the CRM mobile
app. Shared standard with grocery (barcode/inventory) and the timekeeping project's
kiosk — one identical fleet, swap-on-failure across projects.

## Why this device for CRM

The CRM use case is card capture → OCR → contact create (docs/05-api.md
`POST /cards/scan`). What matters:

- **Rear camera with autofocus** — 50 MP f/1.8. Autofocus at document distance
  is the make-or-break feature for card OCR; it's the corner ultra-budget
  phones cut (fixed-focus rear cams OCR poorly at 15–25 cm).
- **One UI plays nice with Expo/React Native** — no aggressive background-app
  killing (Xiaomi/Oppo/Vivo ROMs fight dev workflows and foreground services).
- **Ubiquitous PH stock** (~₱7,500–9,000): units, parts, and commodity repairs
  everywhere; keep a spare pre-configured.
- microSD slot (offline capture buffer), 4G, 5,000 mAh.

## Rejected alternatives

- **Redmi 13C (~₱5,500)** — acceptable for OCR-only duty, but PH units usually
  lack NFC (needed by the timekeeping kiosk), and MIUI's task killer is a support
  tax. Standardizing one SKU across the three projects beats the ₱2–3k saving.
- **Rugged phones (Blackview/Oukitel/…)** — thin PH stock, weak cameras, worse
  ROMs; durability is solved with a case, not a niche brand.
- **Galaxy A07 5G (~₱8,290, evaluated 2026-07-28)** — great handheld value
  (6 yr updates, 6,000 mAh, 50 MP AF) but the PH SKU has **no NFC**, so it
  can't be the shared fleet SKU with the timekeeping kiosk.
- **Infinix Hot 70 (~₱7,999, evaluated 2026-07-28)** — NFC + bypass charging
  confirmed on PH units, but XOS bloat/task-killer is a dev/support tax and
  the parts ecosystem is weaker; would need a validation unit before fleet
  buy. A15/A16 kept as the standard.

## Setup notes

- Nothing kiosk-specific for CRM: normal handheld use.
- If a unit is rotated in from kiosk duty, remove the charge-limit setting and
  device-owner lockdown first (see timekeeping/docs/kiosk-device-hardware.md).
