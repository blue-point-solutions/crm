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

// Tolerates a single stray space inside the domain (`\s?` after the first
// domain segment) -- real-device testing found ML Kit twice recognizing
// "gmail.com" with a phantom space as "g mail.com", which broke a strict
// no-space pattern and left the entire email (and the whole line it was on)
// unrecognized. The matched text still needs the space stripped back out
// before being stored (done at the call site) since a real email can't
// contain one.
const EMAIL_RE = /[\w.+-]+@[\w-]+\s?[\w-]*\.[a-z]{2,}/i;
// {6,} (not {7,}) so an 8-digit PH landline number (e.g. "83652803", no
// separators) still matches -- real-device testing found one falling
// exactly one character short of the old, stricter minimum and being left
// as unclaimed leftover text instead of a phone number.
const PHONE_RE = /(\+?\d[\d\-.\s()]{6,}\d)/;
const LINKEDIN_RE = /linkedin\.com\/\S+/i;
const FACEBOOK_RE = /(facebook\.com|fb\.com)\/\S+/i;
const GENERIC_URL_RE = /((https?:\/\/)?(www\.)?[a-z0-9-]+\.[a-z]{2,}(\/\S*)?)/i;
const ADDRESS_HINT_RE =
  /\d+.{0,40}\b(st|street|ave|avenue|rd|road|blvd|boulevard|suite|ste|dr|drive|lane|ln)\b/i;
// Real-device testing against a real Philippine business card showed the
// street-suffix check above misses most PH addresses entirely -- they're
// typically "<number> <barangay/subdivision>, <city>, <province/country>"
// with no "St"/"Ave"/"Blvd"-style keyword. Two more general, non-US-centric
// fallback signals: (a) starts with a building/house number and has 2+
// comma/period-separated segments (the structural shape of an address
// regardless of language), or (b) starts with a number and names a
// country/region explicitly on the card.
const ADDRESS_STRUCTURE_RE = /^\d+\s+\S.*[,.].*[,.]/;
const ADDRESS_COUNTRY_HINT_RE = /\b(philippines|metro manila)\b/i;

function looksLikeAddress(line: string): boolean {
  return (
    ADDRESS_HINT_RE.test(line) ||
    ADDRESS_STRUCTURE_RE.test(line) ||
    (/^\d+\s/.test(line) && ADDRESS_COUNTRY_HINT_RE.test(line))
  );
}
const TITLE_HINT_RE =
  /\b(manager|director|president|ceo|cto|cfo|coo|vp|vice president|engineer|founder|owner|consultant|specialist|lead|head|officer|analyst|coordinator|executive|representative|sales|marketing)\b/i;
// Real-device testing (not the mock, not the web fallback) showed ML Kit
// frequently merges two visually-adjacent card lines -- e.g. a job title and
// the company name directly below it -- into one recognized text block, so
// "Director of Operations" + "Meridian Logistics Group" arrives as a single
// string. Detect and split that out before per-line classification, or the
// merged text gets swallowed whole into jobTitle and company ends up empty.
//
// Strategy: find where a title phrase (keyword + at most a couple of short
// connector clauses like "of Operations") ends, then treat any remaining
// text as a separate company line IF it looks like a distinct proper-noun
// phrase. Trying to greedily match a "run of capitalized words" from the
// left instead over-captures, since title phrases are themselves often
// title-cased ("Director of Operations") -- anchoring on the known title
// vocabulary first is what makes the boundary unambiguous.
const TITLE_PHRASE_RE =
  /\b(manager|director|president|ceo|cto|cfo|coo|vp|vice president|engineer|founder|owner|consultant|specialist|lead|head|officer|analyst|coordinator|executive|representative|sales|marketing)\b(?:\s+(?:of|for|and|the)\s+\w+){0,2}/i;
const COMPANY_SUFFIX_WORD_RE =
  /\b(Inc|LLC|Corp|Corporation|Group|Solutions|Industries|Technologies|Company|Co|Partners|Associates|Enterprises|Ltd|Logistics|Holdings|Ventures|Consulting|Systems|Global|International|Trading)\.?$/i;
const CAPITALIZED_PHRASE_RE = /^([A-Z][a-zA-Z&]*\s+){1,}[A-Z][a-zA-Z&]*$/;

function field(value: string, confidence: number): OcrField {
  return { value: value.trim(), confidence };
}

function splitMergedTitleCompanyLines(rawLines: string[]): string[] {
  const out: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    const titleMatch = trimmed.match(TITLE_PHRASE_RE);
    if (titleMatch && titleMatch.index !== undefined) {
      const titleEnd = titleMatch.index + titleMatch[0].length;
      const titlePart = trimmed.slice(0, titleEnd).trim();
      const rest = trimmed.slice(titleEnd).trim();
      const looksLikeCompany =
        rest.length > 0 && (COMPANY_SUFFIX_WORD_RE.test(rest) || CAPITALIZED_PHRASE_RE.test(rest));
      if (looksLikeCompany) {
        out.push(titlePart);
        out.push(rest);
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

export function parseCardText(rawLines: string[]): OcrResult {
  // Real-device finding: ML Kit doesn't always return one array entry per
  // visual line -- a densely-packed card can come back with an entry like
  // "<address>\n<telefax/email>\n<mobile numbers>", three logical lines
  // bundled into one string with embedded \n's. Treating that as a single
  // atomic "line" let one match (e.g. an address-shaped fragment) claim the
  // whole blob, silently swallowing the phone numbers embedded inside it.
  // Flatten on \n before anything else so every downstream step sees real,
  // individual lines.
  const flatRawLines = rawLines.flatMap((l) => l.split("\n"));

  const lines = splitMergedTitleCompanyLines(flatRawLines)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: OcrResult = { phones: [], emails: [] };
  const claimed = new Set<number>();

  // A single recognized line can contain more than one field -- real-device
  // testing showed ML Kit merging an email and a website URL onto one text
  // block, and an earlier version of this loop stopped at the first pattern
  // match per line (with an early `return`), silently discarding everything
  // else on that line. Each match is now cut out of a per-line `remainder`
  // so later patterns still get a chance to match what's left.
  lines.forEach((line, i) => {
    let remainder = line;
    let consumed = false;
    const cut = (m: RegExpMatchArray) => {
      const start = m.index ?? 0;
      remainder = (remainder.slice(0, start) + " " + remainder.slice(start + m[0].length)).trim();
      consumed = true;
    };

    const emailMatch = remainder.match(EMAIL_RE);
    if (emailMatch) {
      result.emails.push(field(emailMatch[0].replace(/\s+/g, ""), 0.92));
      cut(emailMatch);
    }

    const linkedinMatch = remainder.match(LINKEDIN_RE);
    if (linkedinMatch && !result.linkedin) {
      result.linkedin = field(linkedinMatch[0], 0.9);
      cut(linkedinMatch);
    } else {
      const facebookMatch = remainder.match(FACEBOOK_RE);
      if (facebookMatch && !result.facebook) {
        result.facebook = field(facebookMatch[0], 0.9);
        cut(facebookMatch);
      }
    }

    // Whole-line signal, not a sub-match -- an address is checked against
    // (and consumes) whatever text is left rather than being cut out of it,
    // since street/suite/zip text isn't a clean regex-extractable token the
    // way an email or phone is.
    if (looksLikeAddress(remainder)) {
      if (!result.address) {
        result.address = field(remainder, 0.75);
        consumed = true;
      }
      remainder = "";
    } else {
      // Loop, not a single match -- real-device testing found a line like
      // "Mobile no: 0905-254-8263 /0947-731-9516" with two numbers on it;
      // a single match+cut left the second number as unclaimed leftover
      // text that then polluted the name/title/company guessing below.
      let phoneMatch;
      while (result.phones.length < 3 && (phoneMatch = remainder.match(PHONE_RE))) {
        result.phones.push(field(phoneMatch[0], 0.8));
        cut(phoneMatch);
      }
    }

    const urlMatch = remainder.match(GENERIC_URL_RE);
    if (urlMatch && !result.website) {
      result.website = field(urlMatch[0], 0.7);
      cut(urlMatch);
    }

    // Mark the line claimed if nothing meaningful is left over once contact
    // labels are stripped out too. Real-device testing found lines with
    // *multiple* labels ("Telefax #: <number>- Email:<address>") where each
    // value gets correctly extracted but both label words ("Telefax",
    // "Email") survive in the leftover text -- a single "is the whole
    // leftover just one label" check missed this, since it's two labels
    // plus punctuation, not one. Strip every occurrence of a known label
    // word, then ALL punctuation/symbol characters (Unicode \p{P}/\p{S},
    // not an enumerated list) -- real-device testing also found ML Kit
    // isn't perfectly deterministic between scans of the same physical
    // card: the separator between two phone numbers came back as "/" once
    // and "|" on a later rescan. Enumerating specific punctuation chars
    // chases whichever one happened to show up in the last test; stripping
    // the whole Unicode punctuation/symbol category doesn't.
    if (consumed) {
      const leftoverStripped = remainder
        .replace(/\b(tel|telefax|fax|mobile|cell|phone|email|e-?mail|no|number)\b/gi, "")
        .replace(/[\p{P}\p{S}\s]/gu, "");
      if (leftoverStripped.length === 0) {
        claimed.add(i);
      }
    }
  });

  // Remaining unclaimed lines, in order, are the best guesses for
  // name / title / company -- lower confidence since it's positional, not
  // pattern-matched. First unclaimed line is *usually* the person's name on
  // a business card, but real-device testing found a real counter-example:
  // dealer/reseller cards often lead with the company banner instead (e.g.
  // "EIGHTSYS TRADING" as line 1, with the actual contact person's name,
  // "FE CUVIN-ALONZO", appearing further down). So: pre-scan all remaining
  // lines for an explicit company-entity suffix match first (regardless of
  // position) and claim it as company before assuming the first line is a
  // person -- otherwise the company name gets split into fake first/last
  // name fields, AND the real person's name gets bumped into Company.
  let remaining = lines.map((line, i) => ({ line, i })).filter(({ i }) => !claimed.has(i));

  const companyBySuffix = remaining.find(({ line }) => COMPANY_SUFFIX_WORD_RE.test(line));
  if (companyBySuffix) {
    result.company = field(companyBySuffix.line, 0.55);
    claimed.add(companyBySuffix.i);
    remaining = remaining.filter(({ i }) => i !== companyBySuffix.i);
  }

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

  // Real job titles on a card are short (1-4 words: "Sales Manager",
  // "VP of Sales", "Director of Operations"). Real-device finding: a
  // business tagline like "Computer Parts, Sales and Services" also
  // contains a title keyword ("Sales") purely by coincidence and isn't a
  // person's title at all -- length-gate the match so a long descriptive
  // sentence doesn't get mistaken for a short title just because one word
  // in it happens to match.
  const titleEntry = remaining.find(
    ({ i, line }) => !claimed.has(i) && TITLE_HINT_RE.test(line) && line.split(/\s+/).length <= 4
  );
  if (titleEntry) {
    result.jobTitle = field(titleEntry.line, 0.6);
    claimed.add(titleEntry.i);
  }

  if (!result.company) {
    const companyEntry = remaining.find(({ i }) => !claimed.has(i));
    if (companyEntry) {
      result.company = field(companyEntry.line, 0.5);
      claimed.add(companyEntry.i);
    }
  }

  return result;
}
