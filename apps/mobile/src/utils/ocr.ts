import { extractTextFromImage, isSupported } from "expo-text-extractor";
import { OcrResult } from "../types/contact";
import { parseCardText } from "./ocrParser";

/**
 * Parses a business card image entirely on-device: ML Kit (Android) /
 * Vision (iOS) via expo-text-extractor for text recognition, then
 * parseCardText() for structured field extraction. By design this never
 * leaves the device -- no network call, no backend round-trip. A backend
 * OCR fallback (for cases where on-device recognition proves insufficient)
 * is an intentional future seam, not built here: see platform-ocr-cards
 * (ticket #4) for the pluggable-provider shape this should slot into.
 *
 * expo-text-extractor is a native module -- `isSupported` is false on web
 * (no ML Kit/Vision there), where this falls back to a fixed mock result so
 * the RN-Web dev flow (and the Playwright e2e test) stay exercisable without
 * a native build. On a real device/emulator this always uses the real
 * on-device engine, never the mock.
 */
export async function parseCardImage(imageUri: string): Promise<OcrResult> {
  if (!isSupported) {
    return mockCardResult();
  }

  const lines = await extractTextFromImage(imageUri);
  return parseCardText(lines);
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
