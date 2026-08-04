/**
 * On platforms without on-device OCR (web) the dev-only mock must stay out of
 * production: a real user uploading a card in the web app must land on manual
 * entry, never on a form prefilled with fabricated "Jane Smith" data.
 */
jest.mock("expo-text-extractor", () => ({
  isSupported: false,
  extractTextFromImage: jest.fn(),
}));
jest.mock("@platform/ocr-cards", () => ({
  scanCard: jest.fn(),
}));

import { parseCardImage, parseCardImageSafe } from "../ocr";

const g = globalThis as unknown as { __DEV__: boolean };

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  g.__DEV__ = true;
});

describe("parseCardImage without on-device OCR", () => {
  it("returns the mock result in dev builds", async () => {
    g.__DEV__ = true;
    const result = await parseCardImage("blob:card");
    expect(result.firstName?.value).toBe("Jane");
  });

  it("throws in production builds so callers fall back to manual entry", async () => {
    g.__DEV__ = false;
    await expect(parseCardImage("blob:card")).rejects.toThrow(/not available/);
    await expect(parseCardImageSafe("blob:card")).resolves.toBeNull();
  });
});
