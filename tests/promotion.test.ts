import { describe, expect, it } from "vitest";
import { ProductionPolicyGate } from "../src/policy/policy-gate";
import { fakeCatalogue } from "./fake-catalogue";

const gate = new ProductionPolicyGate(fakeCatalogue.eligibilityAssessments, fakeCatalogue.exposureProfiles);

describe("production policy gate", () => {
  it("does not promote staging adapters implicitly", () => {
    const adapter = fakeCatalogue.adapters[0]!;
    const manifest = fakeCatalogue.adapterManifests[0]!;
    const decision = gate.evaluate({ request: { jurisdictionId: "TEST", identifier: { schemeId: "test-id", value: "DEMO-001" } }, adapter, manifest });
    expect(decision.allowed).toBe(false);
    expect(decision.cachePolicy).toEqual({ mode: "no-store" });
  });
});
