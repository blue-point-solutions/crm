import { parseCardText } from "../ocrParser";

describe("parseCardText", () => {
  it("parses a typical business card", () => {
    const result = parseCardText([
      "Jane Smith",
      "Product Manager",
      "Acme Corp",
      "+1 555-867-5309",
      "jane.smith@acme.com",
      "www.acmecorp.com",
      "123 Main St, Springfield, IL 62701",
      "linkedin.com/in/janesmith",
    ]);

    expect(result.firstName?.value).toBe("Jane");
    expect(result.lastName?.value).toBe("Smith");
    expect(result.jobTitle?.value).toBe("Product Manager");
    expect(result.company?.value).toBe("Acme Corp");
    expect(result.phones).toHaveLength(1);
    expect(result.phones[0].value).toBe("+1 555-867-5309");
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].value).toBe("jane.smith@acme.com");
    expect(result.website?.value).toBe("www.acmecorp.com");
    expect(result.address?.value).toContain("123 Main St");
    expect(result.linkedin?.value).toBe("linkedin.com/in/janesmith");
  });

  it("regex-matched fields (email/phone/social) get higher confidence than positionally-guessed ones (name/title/company)", () => {
    const result = parseCardText([
      "Jane Smith",
      "Product Manager",
      "jane.smith@acme.com",
    ]);
    expect(result.emails[0].confidence).toBeGreaterThan(result.firstName!.confidence);
    expect(result.emails[0].confidence).toBeGreaterThan(result.jobTitle!.confidence);
  });

  it("handles multiple phone numbers up to a cap of 3", () => {
    const result = parseCardText([
      "John Doe",
      "555-111-2222",
      "555-333-4444",
      "555-555-6666",
      "555-777-8888",
    ]);
    expect(result.phones).toHaveLength(3);
  });

  it("does not misparse an address line as a phone number", () => {
    const result = parseCardText(["John Doe", "4567 Industrial Blvd, Suite 200"]);
    expect(result.phones).toHaveLength(0);
    expect(result.address?.value).toContain("Industrial Blvd");
  });

  it("distinguishes LinkedIn and Facebook URLs from a generic website", () => {
    const result = parseCardText([
      "John Doe",
      "acme.com",
      "linkedin.com/in/johndoe",
      "facebook.com/acmecorp",
    ]);
    expect(result.website?.value).toBe("acme.com");
    expect(result.linkedin?.value).toBe("linkedin.com/in/johndoe");
    expect(result.facebook?.value).toBe("facebook.com/acmecorp");
  });

  it("handles a single-word name gracefully", () => {
    const result = parseCardText(["Madonna", "Recording Artist"]);
    expect(result.firstName?.value).toBe("Madonna");
    expect(result.lastName).toBeUndefined();
  });

  it("returns an empty-ish result for empty input without throwing", () => {
    const result = parseCardText([]);
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
    expect(result.firstName).toBeUndefined();
  });

  it("filters out blank lines from OCR noise", () => {
    const result = parseCardText(["Jane Smith", "", "  ", "jane@acme.com"]);
    expect(result.firstName?.value).toBe("Jane");
    expect(result.emails[0].value).toBe("jane@acme.com");
  });

  it("splits a title+company line merged into one block by the OCR engine", () => {
    // Real finding from on-device (ML Kit) testing: adjacent card lines with
    // small vertical spacing get recognized as a single text block.
    const result = parseCardText([
      "Marcus Chen",
      "Director of Operations Meridian Logistics Group",
      "+1 415-555-2891",
      "marcus.chen@meridianlogistics.com",
      "www.meridianlogistics.com",
      "2200 Harbor Blvd, Suite 400, Oakland, CA 94607",
      "linkedin.com/in/marcuschen",
    ]);
    expect(result.firstName?.value).toBe("Marcus");
    expect(result.lastName?.value).toBe("Chen");
    expect(result.jobTitle?.value).toBe("Director of Operations");
    expect(result.company?.value).toBe("Meridian Logistics Group");
    expect(result.phones[0].value).toBe("+1 415-555-2891");
    expect(result.emails[0].value).toBe("marcus.chen@meridianlogistics.com");
  });

  it("extracts both fields when an email and a website are merged onto one OCR line", () => {
    // Real finding from on-device testing: the first version of the
    // per-line loop stopped at the first pattern match (email) and silently
    // discarded the rest of the line, so the website was lost entirely.
    const result = parseCardText([
      "Marcus Chen",
      "marcus.chen@meridianlogistics.com www.meridianlogistics.com",
    ]);
    expect(result.emails[0].value).toBe("marcus.chen@meridianlogistics.com");
    expect(result.website?.value).toBe("www.meridianlogistics.com");
  });

  it("recognizes a Philippine-style address with no US street-suffix keyword", () => {
    // Real finding from scanning an actual physical PH business card: the
    // old ADDRESS_HINT_RE only matched US-style suffixes (St/Ave/Blvd/etc),
    // so this fell through to the positional company-name guess instead --
    // wrongly overwriting Company while leaving Address empty.
    const result = parseCardText([
      "Mark Ignacio",
      "Chief Executive Officer",
      "17 Dona Rita Digz, Parnaque. Manila Philippines",
      "PHILinspect",
    ]);
    expect(result.address?.value).toContain("Dona Rita Digz");
    expect(result.company?.value).toBe("PHILinspect");
  });

  it("handles a real ML Kit result where one array entry bundles multiple logical lines via embedded newlines", () => {
    // Exact raw output captured from expo-text-extractor scanning a real,
    // densely-packed reseller business card. Entry [1] alone bundles the
    // address, telefax/email, and mobile numbers into one string joined by
    // \n -- treating it as a single atomic line let the address match
    // swallow the whole block, discarding the phone numbers entirely. This
    // card also leads with the company banner ("EIGHTSYS TRADING") instead
    // of the contact person's name ("FE CUVIN-ALONZO").
    const result = parseCardText([
      "EIGHTSYS TRADING",
      "5th Flr. Gilmore IT Center, Gilmore Ave., Quezon City\nTelefax #: 83652803- Email:fecalonzo0425@gmail.com\nMobile no: 0905-254-8263 /0947-731-9516",
      "FE CUVIN-ALONZO",
      "POS & BIOMETRICS PRODUCTS\nComputer Parts, Sales and Services",
    ]);

    expect(result.company?.value).toBe("EIGHTSYS TRADING");
    expect(result.firstName?.value).toBe("FE");
    expect(result.lastName?.value).toBe("CUVIN-ALONZO");
    expect(result.emails[0].value).toBe("fecalonzo0425@gmail.com");
    expect(result.phones.map((p) => p.value)).toEqual(
      expect.arrayContaining([expect.stringContaining("0905-254-8263"), expect.stringContaining("0947-731-9516")])
    );
    expect(result.address?.value).toContain("Gilmore Ave");
    expect(result.address?.value).not.toContain("Mobile no");
    // "Computer Parts, Sales and Services" is the business's tagline, not a
    // personal job title -- it only contains "Sales" coincidentally. Real
    // job titles are short (<=4 words); this is 5, so it should be left
    // unclaimed rather than wrongly assigned as jobTitle.
    expect(result.jobTitle).toBeUndefined();
  });

  it("doesn't mistake a long business-description sentence for a short job title just because one word matches", () => {
    const result = parseCardText(["Jane Doe", "Computer Parts, Sales and Services"]);
    expect(result.jobTitle).toBeUndefined();
  });

  it("is robust to which punctuation character ML Kit uses as a separator between two numbers on the same line", () => {
    // Real finding: rescanning the exact same physical card came back with
    // "|" as the separator between two phone numbers instead of "/" seen on
    // an earlier scan -- ML Kit isn't perfectly deterministic between scans.
    // An earlier fix only stripped "/" specifically from the leftover label
    // text, so it broke again the moment a different separator showed up.
    const result = parseCardText(["Mark Test", "Mobile no: 0905-254-8263 | 0947-731-9516"]);
    expect(result.firstName?.value).toBe("Mark");
    expect(result.lastName?.value).toBe("Test");
    expect(result.phones.map((p) => p.value)).toEqual(
      expect.arrayContaining([expect.stringContaining("0905-254-8263"), expect.stringContaining("0947-731-9516")])
    );
  });

  it("recognizes an email even when ML Kit inserts a stray space inside the domain", () => {
    // Real finding: rescanning the same card a third time, ML Kit read
    // "gmail.com" as "g mail.com" -- a phantom space breaking a strict
    // no-space email pattern entirely, which left the whole line (a
    // Telefax/Email block) unclaimed and it got mistaken for the contact's
    // name. The stray space must also not end up in the stored value.
    const result = parseCardText(["Mark Test", "Email:fecalonzo0425@g mail.com"]);
    expect(result.emails[0]?.value).toBe("fecalonzo0425@gmail.com");
    expect(result.firstName?.value).toBe("Mark");
  });

  it("prioritizes an explicit 'Name | Title' pattern over a generic positional guess", () => {
    // Exact raw output captured scanning a real promotional/flyer-style
    // card ("Mr. Butler" pest control). The brand logo OCR'd as garbage
    // ("MBUtLER"), the service-type banner ("PEST CONTROL SPECIALIST")
    // contains a title keyword ("specialist") and looked like a title, and
    // a marketing sentence was the next short-ish remaining line -- all
    // competing with the real "Name | Title" pair further down the card.
    // Without prioritizing the pipe pattern, the name/title guesses were
    // both wrong and the real contact (Ina Jalosjos, General Manager) was
    // never recognized as either.
    const result = parseCardText([
      "MBUtLER",
      "PEST CONTROL SPECIALIST",
      "Don't let pests take over your property, call us\nfor top-notch pest control services today!",
      "TYPES OF PESTS WE DEAL WITH:",
      "Termites Cockroaches Ants Mosquitoes Flies\nINA JALOSJOS | GENERAL MANAGER",
      "CONTACT US",
      "09267419295",
      "info @mrbutler.com.ph",
    ]);
    expect(result.firstName?.value).toBe("INA");
    expect(result.lastName?.value).toBe("JALOSJOS");
    expect(result.jobTitle?.value).toBe("GENERAL MANAGER");
    // Company should not be the marketing sentence -- it's too long to be
    // a plausible company name (the length-gate fallback should skip it).
    expect(result.company?.value).not.toContain("Don't let pests");
  });
});
