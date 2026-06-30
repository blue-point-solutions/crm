# iOS / macOS Setup (Mac mini)

The iOS app target (React Native + Expo, RN-Web shares the web build) is built and
released from the **Mac mini** — iOS native tooling is macOS-only.

## Toolchain
- **Xcode** (latest stable) + Command Line Tools: `xcode-select --install`; open
  Xcode once to accept the license + install components.
- **CocoaPods**: `brew install cocoapods` (or `sudo gem install cocoapods`).
- **Node 20+**, **Watchman** (`brew install watchman`), **Ruby** (for pods).
- **EAS CLI**: `npm i -g eas-cli` (cloud builds) — optional if archiving via Xcode.

## Run the app on iOS
```bash
cd ~/projects/crm/apps/mobile
npm install
npx expo run:ios          # builds + launches the iOS simulator (no Apple acct needed)
# or:  npx pod-install && open ios/*.xcworkspace   then Run in Xcode
```
Simulator = fast inner loop, but **no camera** → the business-card scanner must be
tested on a **real iPhone**.

## iOS config the CRM needs (per docs/03 + 05)
- **Camera + Photo Library** (card scanner — brief §4.1): add to `app.json`
  `ios.infoPlist` (or Info.plist):
  - `NSCameraUsageDescription` — "Scan business cards to add contacts."
  - `NSPhotoLibraryUsageDescription` — "Import a business-card photo."
  Without these, `getUserMedia`/the camera API fails silently (same failure class
  as the schedule app's missing Android `CAMERA` permission).
- **OCR (on-device):** ML Kit text-recognition iOS pod, **or** Apple **Vision**
  (`VNRecognizeTextRequest`) as the iOS OCR provider feeding `platform-ocr-cards`'
  parser. Backend Cloud Vision is the fallback.
- **Push (Phase 2):** Push Notifications capability + APNs key; entitlement.
- **Universal links / associated domains (later):** for QR/vCard + `/q/` deep
  links — `apple-app-site-association` + entitlement.
- **ATS:** API is HTTPS (Cloudflare) — no ATS exceptions needed.

## Signing & TestFlight — HUMAN-GATE
Device installs and TestFlight require an **Apple Developer Program** account
($99/yr) + signing certs/provisioning profiles, and a final **bundle id** (tied to
the brand decision, H1). Flow: `eas build -p ios` (or Xcode Archive) → upload to
**App Store Connect** → **TestFlight**. The first submission is human-only. The
agent must **not** fake these — flag the gate on the ticket and `status:blocked`.

## What the agent can vs cannot do
- ✅ Without Apple account: iOS native config, simulator builds, RN/JS work, pod
  setup, on-device-less verification.
- ⛔ Needs Apple account/human: real-device install, signed builds, TestFlight,
  App Store submission, and **camera/OCR device verification** (physical iPhone).
