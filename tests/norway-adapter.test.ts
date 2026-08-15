import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { norwayAdapter, NORWAY_ACCEPT, NORWAY_SOURCE_ID } from "../src/adapters/norway/no-brreg-enhetsregisteret-v1";
import type { AdapterContext, UpstreamResponse } from "../src/lookup/types";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/nor-entity.json", import.meta.url), "utf8")) as Record<string, unknown>;

function upstream(status: number, body: unknown = fixture, contentType = "application/hal+json"): UpstreamResponse {
  const response = new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": contentType } });
  return { status: response.status, headers: response.headers, body: response.body };
}

function context(response: UpstreamResponse, capture?: (sourceId: string, request: { url: string; headers?: Record<string, string> }) => void): AdapterContext {
  let tick = 0;
  return {
    fetcher: {
      request: async (sourceId, request) => {
        capture?.(sourceId, request);
        return response;
      },
    },
    clock: { now: () => new Date(tick++ === 0 ? "2026-08-14T08:00:00.000Z" : "2026-08-14T08:00:01.000Z") },
    logger: { info() {}, warn() {}, error() {} },
    requestId: "req-nor-test",
  };
}

describe("Norway Enhetsregisteret adapter", () => {
  it("normalizes a formatted organisation number without removing leading zeroes", () => {
    expect(norwayAdapter.validateIdentifier({ schemeId: "no-organisasjonsnummer", value: "012 345-678" })).toEqual({
      ok: true,
      normalizedValue: "012345678",
    });
    expect(norwayAdapter.validateIdentifier({ schemeId: "no-organisasjonsnummer", value: "https://evil.test" })).toMatchObject({ ok: false });
  });

  it("maps official identity, status, entity type, address and industry while preserving raw flags", async () => {
    let requestedUrl = "";
    const result = await norwayAdapter.lookup(
      { jurisdictionId: "NOR", identifier: { schemeId: "no-organisasjonsnummer", value: "923609016" } },
      context(upstream(200), (sourceId, request) => {
        expect(sourceId).toBe(NORWAY_SOURCE_ID);
        expect(request.headers?.accept).toBe(NORWAY_ACCEPT);
        requestedUrl = request.url;
      }),
    );
    expect(requestedUrl).toBe("https://data.brreg.no/enhetsregisteret/api/enheter/923609016");
    expect(result.record.facts.legalName.value).toBe("EQUINOR ASA");
    expect(result.record.facts.status?.value?.canonical).toBe("active");
    expect(result.record.facts.entityType?.value).toEqual({ code: "ASA", label: "Allmennaksjeselskap" });
    expect(result.record.facts.registeredAddress?.value?.structured).toMatchObject({ postalCode: "4035", countryCode: "NO" });
    expect(result.record.facts.industryCodes?.value).toEqual(["06.100"]);
    expect(result.record.sourceSpecific[NORWAY_SOURCE_ID]?.statusFlags).toEqual({
      konkurs: false,
      underAvvikling: false,
      underTvangsavviklingEllerTvangsopplosning: false,
      slettedato: null,
    });
    expect(result.execution.cacheStatus).toBe("bypass-no-store");
  });

  it.each([
    [{ konkurs: true, underAvvikling: true }, "bankruptcy"],
    [{ underAvvikling: true, underTvangsavviklingEllerTvangsopplosning: true }, "in-liquidation"],
    [{ underTvangsavviklingEllerTvangsopplosning: true, slettedato: "2020-01-01" }, "compulsory-liquidation"],
    [{ slettedato: "2020-01-01" }, "dissolved"],
  ])("uses fixed status precedence", async (overrides, expected) => {
    const result = await norwayAdapter.lookup(
      { jurisdictionId: "NOR", identifier: { schemeId: "no-organisasjonsnummer", value: "923609016" } },
      context(upstream(200, { ...fixture, ...overrides })),
    );
    expect(result.record.facts.status?.value?.canonical).toBe(expected);
  });

  it("keeps 404 and legal-withdrawal 410 distinct", async () => {
    const request = { jurisdictionId: "NOR", identifier: { schemeId: "no-organisasjonsnummer", value: "923609016" } };
    await expect(norwayAdapter.lookup(request, context(upstream(404, null)))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(norwayAdapter.lookup(request, context(upstream(410, null)))).rejects.toMatchObject({ code: "WITHDRAWN_FOR_LEGAL_REASONS" });
  });

  it("fails closed when a required field disappears or changes type", async () => {
    const request = { jurisdictionId: "NOR", identifier: { schemeId: "no-organisasjonsnummer", value: "923609016" } };
    const { navn: _removed, ...withoutName } = fixture;
    await expect(norwayAdapter.lookup(request, context(upstream(200, withoutName)))).rejects.toMatchObject({ code: "SOURCE_SCHEMA_CHANGED" });
    await expect(norwayAdapter.lookup(request, context(upstream(200, { ...fixture, konkurs: "false" })))).rejects.toMatchObject({ code: "SOURCE_SCHEMA_CHANGED" });
  });
});
