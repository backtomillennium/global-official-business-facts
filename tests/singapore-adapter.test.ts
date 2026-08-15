import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { singaporeAdapter, SINGAPORE_RESOURCE_ID, SINGAPORE_SOURCE_ID } from "../src/adapters/singapore/sg-acra-opendata-v1";
import type { AdapterContext, UpstreamResponse } from "../src/lookup/types";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/sgp-datastore.json", import.meta.url), "utf8")) as Record<string, unknown>;

function upstream(body: unknown, status = 200): UpstreamResponse {
  const response = new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  return { status, headers: response.headers, body: response.body };
}

function context(response: UpstreamResponse, capture?: (url: string) => void): AdapterContext {
  let tick = 0;
  return {
    fetcher: {
      request: async (sourceId, request) => {
        expect(sourceId).toBe(SINGAPORE_SOURCE_ID);
        capture?.(request.url);
        return response;
      },
    },
    clock: { now: () => new Date(`2026-08-14T08:00:0${tick++}.000Z`) },
    logger: { info() {}, warn() {}, error() {} },
    requestId: "req-sgp-test",
  };
}

const request = { jurisdictionId: "SGP", identifier: { schemeId: "sg-uen", value: "201201936C" } };

describe("Singapore ACRA data.gov.sg adapter", () => {
  it("normalizes a UEN using the verified alphanumeric binding", () => {
    expect(singaporeAdapter.validateIdentifier({ schemeId: "sg-uen", value: "2012 01936c" })).toEqual({
      ok: true,
      normalizedValue: "201201936C",
    });
    expect(singaporeAdapter.validateIdentifier({ schemeId: "sg-uen", value: "https://evil.test" })).toMatchObject({ ok: false });
  });

  it("uses one UEN-filtered request against only the verified resource", async () => {
    let requested = "";
    const result = await singaporeAdapter.lookup(request, context(upstream(fixture), (url) => { requested = url; }));
    const url = new URL(requested);
    expect(url.origin + url.pathname).toBe("https://data.gov.sg/api/action/datastore_search");
    expect(url.searchParams.get("resource_id")).toBe(SINGAPORE_RESOURCE_ID);
    expect(url.searchParams.get("filters")).toBe('{"uen":"201201936C"}');
    expect(url.searchParams.get("limit")).toBe("1");
    expect(result.record.facts.legalName.value).toBe("MILLENNIUM AUTOMATION & SYSTEMS PTE. LTD.");
    expect(result.record.facts.status?.value).toEqual({ canonical: "other", sourceLabel: "Deregistered" });
    expect(result.record.facts.entityType?.value).toEqual({ code: null, label: "Local Company" });
    expect(result.record.facts.registrationDate?.value).toBe("2012-01-26");
    expect(result.record.facts.registeredAddress?.value?.structured).toEqual({ streetName: "BENCOOLEN STREET", postalCode: "189648" });
    expect(result.execution.cacheStatus).toBe("bypass-no-store");
  });

  it("fails closed when the verified legal-name binding disappears", async () => {
    const result = structuredClone(fixture);
    if (typeof result.result !== "object" || result.result === null) throw new Error("bad fixture");
    const bound = result.result as { fields: Array<{ id: string }> };
    bound.fields = bound.fields.filter((field) => field.id !== "entity_name");
    await expect(singaporeAdapter.lookup(request, context(upstream(result)))).rejects.toMatchObject({ code: "SOURCE_SCHEMA_CHANGED" });
  });

  it("keeps an empty filtered result distinct from source errors", async () => {
    const result = structuredClone(fixture);
    if (typeof result.result !== "object" || result.result === null) throw new Error("bad fixture");
    (result.result as { records: unknown[] }).records = [];
    await expect(singaporeAdapter.lookup(request, context(upstream(result)))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(singaporeAdapter.lookup(request, context(upstream({ error: "rate" }, 429)))).rejects.toMatchObject({ code: "SOURCE_BAD_RESPONSE" });
  });
});
