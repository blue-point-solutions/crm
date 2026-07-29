import { extractTextFromImage, isSupported } from "expo-text-extractor";
import { scanCard, TextExtractorPort } from "@platform/ocr-cards";
import { OcrResult } from "../types/contact";

/**
 * Parses a business card image entirely on-device: ML Kit (Android) /
 * Vision (iOS) via expo-text-extractor for text recognition, then the
 * @platform/ocr-cards parser for structured field extraction. By design this
 * never leaves the device -- no network call, no backend round-trip.
 *
 * The parser + provider port now live in the library package
 * @platform/ocr-cards (ticket #4's pluggable-provider shape): the app owns
 * the expo-text-extractor dependency and injects it as a TextExtractorPort,
 * so a backend OCR fallback later is just another port implementation.
 *
 * expo-text-extractor is a native module -- `isSupported` is false on web
 * (no ML Kit/Vision there), where this falls back to a fixed mock result so
 * the RN-Web dev flow (and the Playwright e2e test) stay exercisable without
 * a native build. On a real device/emulator this always uses the real
 * on-device engine, never the mock.
 */
const expoTextExtractor: TextExtractorPort = {
  extractText: (imageRef: string) => extractTextFromImage(imageRef),
};

export async function parseCardImage(imageUri: string): Promise<OcrResult> {
  if (!isSupported) {
    return mockCardResult();
  }

  return scanCard(expoTextExtractor, imageUri);
}

function mockCardResult(): OcrResult {
  return {
    firstName: { value: "Jane", confidence: 0.95 },
    lastName: { value: "Smith", confidence: 0.92 },
    jobTitle: { value: "Product Manager", confidence: 0.61 },
    company: { value: "Acme Corp", confidence: 0.88 },
    phones: [
      { value: "+1 555-867-5309", confidence: 0.78 },
      { value: "+1 555-123-4567", confidence: 0.55 },
    ],
    emails: [{ value: "jane.smith@acme.com", confidence: 0.97 }],
    website: { value: "www.acmecorp.com", confidence: 0.65 },
    address: { value: "123 Main St, Springfield, IL 62701", confidence: 0.58 },
    linkedin: { value: "linkedin.com/in/janesmith", confidence: 0.91 },
    facebook: undefined,
  };
}
