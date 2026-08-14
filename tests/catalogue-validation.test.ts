import { describe, expect, it } from "vitest";
import { validateCatalogue } from "../scripts/catalogue-utils";
import { fakeCatalogue } from "./fake-catalogue";

describe("catalogue integrity", () => {
  it("accepts a valid staged catalogue", () => {
    expect(validateCatalogue(fakeCatalogue)).toEqual([]);
  });

  it("requires explicit eligible assessment before PRODUCTION", () => {
    const invalid = structuredClone(fakeCatalogue);
    invalid.adapterManifests[0]!.promotionState = "PRODUCTION";
    expect(validateCatalogue(invalid)).toContain("adapter test-basic-v1: PRODUCTION requires an eligible ProductionEligibilityAssessment");
  });
});
