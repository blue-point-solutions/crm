import { OcrField, OcrResult } from "../types/contact";

/**
 * Turns raw OCR text lines (as returned by an on-device text-recognition
 * engine, e.g. ML Kit) into the structured business-card fields the review
 * screen expects. Pure function -- no I/O, unit-testable on sample card
 * texts (ticket #4's acceptance criteria).
 *
 * Confidence here is a parser-side heuristic (how strongly a line matches
 * its assigned category), NOT a real OCR engine confidence score -- ML Kit's
 * plain-text output doesn't expose per-field confidence the way the old
 * client-side mock fabricated. Regex-matched fields (email/phone/website/
 * social) get high confidence; positionally-guessed fields (name/title/
 * company, inferred from line order rather than a pattern match) get lower
 * confidence so the review screen's low-confidence highlighting still means
 * something.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\-.\s()]{7,}\d)/;
const LINKEDIN_RE = /linkedin\.com\/\S+/i;
const FACEBOOK_RE = /(facebook\.com|fb\.com)\/\S+/i;
const GENERIC_URL_RE = /((https?:\/\/)?(www\.)?[a-z0-9-]+\.[a-z]{2,}(\/\S*)?)/i;
const ADDRESS_HINT_RE =
  /\d+.{0,40}\b(st|street|ave|avenue|rd|road|blvd|boulevard|suite|ste|dr|drive|lane|ln)\b/i;
const TITLE_HINT_RE =
  /\b(manager|director|president|ceo|cto|cfo|coo|vp|vice president|engineer|founder|owner|consultant|specialist|lead|head|officer|analyst|coordinator|executive|representative|sales|marketing)\b/i;

function field(value: string, confidence: number): OcrField {
  return { value: value.trim(), confidence };
}

export function parseCardText(rawLines: string[]): OcrResult {
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);

  const result: OcrResult = { phones: [], emails: [] };
  const claimed = new Set<number>();

  lines.forEach((line, i) => {
    const emailMatch = line.match(EMAIL_RE);
    if (emailMatch) {
      result.emails.push(field(emailMatch[0], 0.92));
      claimed.add(i);
      return;
    }
    const linkedinMatch = line.match(LINKEDIN_RE);
    if (linkedinMatch && !result.linkedin) {
      result.linkedin = field(linkedinMatch[0], 0.9);
      claimed.add(i);
      return;
    }
    const facebookMatch = line.match(FACEBOOK_RE);
    if (facebookMatch && !result.facebook) {
      result.facebook = field(facebookMatch[0], 0.9);
      claimed.add(i);
      return;
    }
    const phoneMatch = line.match(PHONE_RE);
    // Guard against addresses/zip-heavy lines being misread as phone numbers.
    if (phoneMatch && !ADDRESS_HINT_RE.test(line) && result.phones.length < 3) {
      result.phones.push(field(phoneMatch[0], 0.8));
      claimed.add(i);
      return;
    }
    if (ADDRESS_HINT_RE.test(line) && !result.address) {
      result.address = field(line, 0.75);
      claimed.add(i);
      return;
    }
    const urlMatch = line.match(GENERIC_URL_RE);
    if (urlMatch && !result.website) {
      result.website = field(urlMatch[0], 0.7);
      claimed.add(i);
      return;
    }
  });

  // Remaining unclaimed lines, in order, are the best guesses for
  // name / title / company -- lower confidence since it's positional, not
  // pattern-matched. First unclaimed line is almost always the name on a
  // business card; a line matching common job-title keywords is the title;
  // the next remaining line is the company.
  const remaining = lines
    .map((line, i) => ({ line, i }))
    .filter(({ i }) => !claimed.has(i));

  const nameEntry = remaining[0];
  if (nameEntry) {
    const parts = nameEntry.line.split(/\s+/);
    if (parts.length >= 2) {
      result.firstName = field(parts[0], 0.55);
      result.lastName = field(parts.slice(1).join(" "), 0.55);
    } else if (parts.length === 1) {
      result.firstName = field(parts[0], 0.4);
    }
    claimed.add(nameEntry.i);
  }

  const titleEntry = remaining.find(({ i, line }) => !claimed.has(i) && TITLE_HINT_RE.test(line));
  if (titleEntry) {
    result.jobTitle = field(titleEntry.line, 0.6);
    claimed.add(titleEntry.i);
  }

  const companyEntry = remaining.find(({ i }) => !claimed.has(i));
  if (companyEntry) {
    result.company = field(companyEntry.line, 0.5);
    claimed.add(companyEntry.i);
  }

  return result;
}
