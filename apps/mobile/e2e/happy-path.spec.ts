/**
 * e2e/happy-path.spec.ts
 *
 * Drives the CRM mobile app's MVP happy path (RN-Web, live Metro dev server)
 * against the REAL local FastAPI backend for auth (register/login, ticket #7),
 * headed by default so it can be watched and corrected rather than trusted
 * blindly.
 *
 *  1. Register a brand-new account -> real POST /auth/register (platform-core
 *     AuthService/UserService under the hood, not a mock) -> lands on Dashboard.
 *  2. Dashboard -> "Scan a Business Card" -> camera permission denied (no
 *     camera device in this browser context) -> "Import from Photos" fallback
 *     -> upload a fixture image.
 *  3. Card Scanner Review screen: mock OCR data loads (client-side mock --
 *     see src/utils/ocr.ts, OCR ticket #4 is still open, this is expected,
 *     not a bug), fill required Marketing Consent, save.
 *  4. Confirm screen ("Contact Saved") -> View Contact -> Contacts list.
 *
 * KNOWN GAP (not a test bug): contact persistence (#8 contacts API, blocked
 * on #3 platform-contacts) is not built yet, so "Save Contact" is also a
 * client-side mock (see CardScannerReviewScreen.tsx TODO) and the Contacts
 * list will legitimately be empty at the end of this test. This test covers
 * everything that is real today; extend step 4 once #3/#8 land.
 *
 * REAL FINDING from building this test: Expo's web dev server double-mounts
 * the screen tree in dev mode (React StrictMode double-render), leaving a
 * stale, `display:none` duplicate of every screen's DOM briefly present
 * alongside the live one -- e.g. two "Email" inputs resolve, and picking the
 * wrong one silently drops keystrokes. `.last()` reliably targets the live
 * instance (confirmed via computed-style inspection: the stale ancestor has
 * `display:none`, the live one doesn't) -- used throughout below.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";

test("register -> scan -> review -> save happy path", async ({ page }) => {
  const uniqueEmail = `e2e+${Date.now()}@bluepointsolutions.dev`;
  const password = "correctHorse99!";

  // --- 1. Register (real backend) -----------------------------------------
  await page.goto("/");
  await expect(page.getByText("Don't have an account? Register").last()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByText("Don't have an account? Register").last().click();

  await expect(page.getByPlaceholder("Full Name").last()).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder("Full Name").last().fill("E2E Test User");
  await page.getByPlaceholder("Email").last().fill(uniqueEmail);
  await page.getByPlaceholder("Password").last().fill(password);

  const registerResponse = page.waitForResponse(
    (res) => res.url().includes("/auth/register") && res.request().method() === "POST"
  );
  // "Create Account" appears twice (screen title + submit button) -- the
  // button is the later one in DOM order.
  await page.getByText("Create Account", { exact: true }).last().click();
  const res = await registerResponse;
  expect(res.status(), "POST /auth/register should succeed against the real backend").toBe(200);

  // Dashboard is the post-register landing screen.
  await expect(page.getByText("Scan a Business Card").last()).toBeVisible({ timeout: 15_000 });

  // --- 2. Scan a business card (camera denied -> photo-library fallback) --
  await page.getByText("Scan a Business Card").last().click();
  await expect(page.getByText("Scan Business Cards").last()).toBeVisible({ timeout: 10_000 });
  await page.getByText("Allow Access").last().click();

  // No camera device available in this browser context -> permission denied
  // -> fallback banner with "Import from Photos" appears.
  await expect(page.getByText("Import from Photos").last()).toBeVisible({ timeout: 10_000 });

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Import from Photos").last().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(path.join(__dirname, "fixtures", "sample-card.jpg"));

  // --- 3. Review screen (extracted details + card image): mock OCR loads, ---
  // fill required field, continue. Marketing Consent lives on the next
  // screen now (Contact Details), not here.
  // "Jane" lands in an <input value>, not text content -- getByDisplayValue,
  // not getByText (an earlier version of this test used getByText and it
  // silently never matched, which is a test-authoring bug, not an app one).
  await expect(page.locator('input[value="Jane"]').last()).toBeVisible({ timeout: 10_000 });

  // Client-side duplicate check (matches against locally-seeded demo
  // contacts) may show a "This contact may already exist" banner with its
  // own View Existing / Save as New actions above the normal form -- handle
  // either state.
  const saveAsNew = page.getByText("Save as New").last();
  if (await saveAsNew.isVisible().catch(() => false)) {
    await saveAsNew.click();
  } else {
    await page.getByText("Next").last().click();
  }

  // --- 3b. Contact Details screen: Source/Tags/Status/Marketing Consent/etc
  // are on a separate screen from the extracted-details+image screen above.
  // "Yes" text is ambiguous (also appears in the Decision Maker toggle) --
  // an earlier version of this test used getByText("Yes").last() and it
  // silently answered Decision Maker instead of Marketing Consent. Uses a
  // testID on CardScannerContactDetailsScreen's TriToggle for this.
  await expect(page.getByText("Contact Details").last()).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("marketing-consent-Yes").last().click();
  await page.getByText("Save Contact").last().click();

  // --- 4. Confirm screen ----------------------------------------------------
  await expect(page.getByText("Contact Saved").last()).toBeVisible({ timeout: 10_000 });
  await page.getByText("View Contact").last().click();
  await expect(page.getByText(/Contacts/i).last()).toBeVisible({ timeout: 10_000 });
});
