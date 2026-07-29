/**
 * Thin shim: the business-card field parser now lives in the library package
 * @platform/ocr-cards (extracted per ticket #4's platform-ocr-cards shape).
 * Re-exported here so existing `utils/ocrParser` imports keep working.
 * The library's OcrField/OcrResult are structurally identical to the ones in
 * types/contact.ts, so callers typed against either interoperate.
 */
export { parseCardText } from "@platform/ocr-cards";
