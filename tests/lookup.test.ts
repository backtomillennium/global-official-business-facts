import { describe, expect, it } from "vitest";
import { Catalogue } from "../src/catalogue/catalogue";
import { fakeAdapter } from "../src/adapters/fake/fake-adapter";
import { AdapterRegistry } from "../src/lookup/adapter-registry";
import { LookupService } from "../src/lookup/lookup-service";
import type { PolicyGate } from "../src/policy/policy-gate";
import { serializeBusinessRecord } from "../src/lookup/serializer";
import { fakeCatalogue } from "./fake-catalogue";

const catalogue = new Catalogue(fakeCatalogue);
const registry = new AdapterRegistry([fakeAdapter]);
const devPolicy: PolicyGate = { evaluate: () => ({ allowed: true, cachePolicy: { mode: "no-store" } }) };
const service = new LookupService(catalogue, registry, devPolicy, () => ({
  fetcher: { request: async () => { throw new Error("fake adapter must not fetch"); } },
  clock: { now: () => new Date("2026-08-14T08:00:00.000Z") },
  logger: { info() {}, warn() {}, error() {} },
  requestId: "req-test",
}));

describe("lookup runtime", () => {
  it("runs typed identifier -> adapter -> canonical record -> public serializer", async () => {
    const request = service.resolveRequest({ jurisdiction: "test", value: "demo-001" });
    const result = await service.lookup(request);
    const publicResponse = serializeBusinessRecord(result.record, catalogue, fakeCatalogue.exposureProfiles[0]);
    expect(publicResponse.identifier).toEqual({ scheme: "test-id", kind: "business", value: "DEMO-001" });
    expect(publicResponse.facts.legalName).toBe("Example Test Entity");
    expect(publicResponse.warnings).toContain("TEST_DATA_ONLY");
  });

  it("keeps NOT_FOUND distinct", async () => {
    const request = service.resolveRequest({ jurisdiction: "TEST", scheme: "test-id", value: "DEMO-404" });
    await expect(service.lookup(request)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid identifiers before lookup", async () => {
    const request = service.resolveRequest({ jurisdiction: "TEST", value: "bad" });
    await expect(service.lookup(request)).rejects.toMatchObject({ code: "INVALID_IDENTIFIER" });
  });
});
