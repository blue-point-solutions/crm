import { OcrResult } from "../types/contact";

/**
 * Parses a business card image and returns extracted OCR fields.
 *
 * TODO: Replace with POST /cards/scan API call (platform-ocr-cards)
 */
export async function parseCardImage(imageUri: string): Promise<OcrResult> {
  // Simulate processing delay
  await new Promise<void>((resolve) => setTimeout(resolve, 1500));

  // Mock result — some fields have confidence < 0.7 to test amber highlighting
  return {
    firstName: { value: "Jane", confidence: 0.95 },
    lastName: { value: "Smith", confidence: 0.92 },
    jobTitle: { value: "Product Manager", confidence: 0.61 }, // low confidence
    company: { value: "Acme Corp", confidence: 0.88 },
    phones: [
      { value: "+1 555-867-5309", confidence: 0.78 },
      { value: "+1 555-123-4567", confidence: 0.55 }, // low confidence
    ],
    emails: [
      { value: "jane.smith@acme.com", confidence: 0.97 },
    ],
    website: { value: "www.acmecorp.com", confidence: 0.65 }, // low confidence
    address: { value: "123 Main St, Springfield, IL 62701", confidence: 0.58 }, // low confidence
    linkedin: { value: "linkedin.com/in/janesmith", confidence: 0.91 },
    facebook: undefined,
  };
}
