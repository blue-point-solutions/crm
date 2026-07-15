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
});
