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
 *  2. Dashboard -> "Scan a Business Card" -> web add-card screen (Use Camera
 *     or Upload Card Photo) -> this test takes the upload path with a
 *     fixture image (the camera path is covered by the fake-camera smoke).
 *  3. Card Scanner Review screen: mock OCR data loads (RN-Web has no ML Kit,
 *     so src/utils/ocr.ts intentionally falls back to a fixed mock result on
 *     web -- on-device OCR is real on Android/iOS), fill required Marketing
 *     Consent, save.
 *  4. Save Contact -> REAL POST /contacts (ticket #8) -> Confirm screen
 *     names the contact -> View Contact -> real ContactDetail from
 *     GET /contacts/{id}.
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

  // Register now uses labeled AppTextInputs (aria-label from label) with a
  // confirm-password field and client-side validation.
  await expect(page.getByLabel("Full Name").last()).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Full Name").last().fill("E2E Test User");
  await page.getByLabel("Email").last().fill(uniqueEmail);
  await page.getByLabel("Password", { exact: true }).last().fill(password);
  await page.getByLabel("Confirm Password").last().fill(password);

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

  // --- 2. Add a business card (web: upload path; camera also available) ---
  // The web add-card screen offers Use Camera (getUserMedia) and Upload Card
  // Photo; this test exercises the upload path — no camera device exists in
  // this browser context, and ML Kit OCR is native-only either way.
  await page.getByText("Scan a Business Card").last().click();
  await expect(page.getByText("Add a Business Card").last()).toBeVisible({ timeout: 10_000 });

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Upload Card Photo").last().click();
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

  // --- 4. Save is REAL now (POST /contacts, ticket #8) ---------------------
  const createResponse = page.waitForResponse(
    (res) => res.url().includes("/contacts") && res.request().method() === "POST"
  );
  await page.getByText("Save Contact").last().click();
  const createRes = await createResponse;
  expect(createRes.status(), "POST /contacts should persist the scanned card").toBe(201);

  // Confirm screen names the saved contact; View Contact opens the real
  // ContactDetail loaded from GET /contacts/{id}.
  await expect(page.getByText("Contact Saved").last()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Jane Smith has been added/).last()).toBeVisible();
  await page.getByText("View Contact").last().click();
  await expect(page.getByText("Acme Corp").last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Product Manager/).last()).toBeVisible();
});
