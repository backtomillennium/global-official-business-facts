import { describe, expect, it } from "vitest";
import { validateCatalogue } from "../scripts/catalogue-utils";
import { fakeCatalogue } from "./fake-catalogue";

describe("catalogue security validation", () => {
  it("rejects path traversal in jurisdiction slugs", () => {
    const invalid = structuredClone(fakeCatalogue);
    invalid.jurisdictions[0]!.slug = "../outside";
    expect(validateCatalogue(invalid).some((message) => message.includes("unsafe slug"))).toBe(true);
  });

  it("rejects javascript/data/non-https source URLs", () => {
    const invalid = structuredClone(fakeCatalogue);
    invalid.sources[0]!.url = "javascript:alert(1)";
    expect(validateCatalogue(invalid).some((message) => message.includes("URL must use https"))).toBe(true);
  });
});
