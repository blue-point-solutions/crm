/**
 * Regression tests for the 2026-07-30 e2e finding: when ML Kit can't deliver
 * (model not fetchable), the scan promise never settles or rejects and the
 * review screen spun forever. parseCardImageSafe must always resolve — with
 * the result, or null on error/timeout.
 */
jest.mock("expo-text-extractor", () => ({
  isSupported: true,
  extractTextFromImage: jest.fn(),
}));
jest.mock("@platform/ocr-cards", () => ({
  scanCard: jest.fn(),
}));

import { parseCardImageSafe } from "../ocr";
import { scanCard } from "@platform/ocr-cards";

const mockScanCard = scanCard as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parseCardImageSafe", () => {
  it("passes a successful scan through", async () => {
    const result = { phones: [], emails: [] };
    mockScanCard.mockResolvedValue(result);

    await expect(parseCardImageSafe("file:///card.jpg")).resolves.toBe(result);
  });

  it("resolves null when the scan rejects", async () => {
    mockScanCard.mockRejectedValue(new Error("ML Kit model unavailable"));

    await expect(parseCardImageSafe("file:///card.jpg")).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("resolves null when the scan never settles (timeout)", async () => {
    mockScanCard.mockReturnValue(new Promise(() => {}));

    await expect(parseCardImageSafe("file:///card.jpg", 25)).resolves.toBeNull();
  });
});
