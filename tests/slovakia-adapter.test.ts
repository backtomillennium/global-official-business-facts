import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slovakiaAdapter, SLOVAKIA_SOURCE_ID } from "../src/adapters/slovakia/sk-rpo-v1";
import type { AdapterContext, UpstreamResponse } from "../src/lookup/types";

const searchFixture = JSON.parse(readFileSync(new URL("./fixtures/svk-search.json", import.meta.url), "utf8")) as Record<string, unknown>;
const entityFixture = JSON.parse(readFileSync(new URL("./fixtures/svk-entity.json", import.meta.url), "utf8")) as Record<string, unknown>;

function upstream(status: number, body: unknown): UpstreamResponse {
  const response = new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  return { status: response.status, headers: response.headers, body: response.body };
}

function context(responses: UpstreamResponse[], urls: string[] = []): AdapterContext {
  let index = 0;
  let tick = 0;
  return {
    fetcher: {
      request: async (sourceId, request) => {
        expect(sourceId).toBe(SLOVAKIA_SOURCE_ID);
        urls.push(request.url);
        const response = responses[index++];
        if (!response) throw new Error("Unexpected extra upstream call");
        return response;
      },
    },
    clock: { now: () => new Date(`2026-08-14T08:00:0${tick++}.000Z`) },
    logger: { info() {}, warn() {}, error() {} },
    requestId: "req-svk-test",
  };
}

const request = { jurisdictionId: "SVK", identifier: { schemeId: "sk-ico", value: "00166197" } };

describe("Slovakia RPO adapter", () => {
  it("normalizes spaces, preserves leading zeroes, and does not invent checksum validation", () => {
    expect(slovakiaAdapter.validateIdentifier({ schemeId: "sk-ico", value: "00 166 197" })).toEqual({ ok: true, normalizedValue: "00166197" });
    expect(slovakiaAdapter.validateIdentifier({ schemeId: "sk-ico", value: "0016619X" })).toMatchObject({ ok: false });
  });

  it("performs the fixed two-call lookup and selects current timed values rather than array index zero", async () => {
    const urls: string[] = [];
    const result = await slovakiaAdapter.lookup(request, context([upstream(200, searchFixture), upstream(200, entityFixture)], urls));
    expect(urls).toEqual([
      "https://api.statistics.sk/rpo/v1/search?identifier=00166197",
      "https://api.statistics.sk/rpo/v1/entity/9389295?showHistoricalData=false&showOrganizationUnits=false",
    ]);
    expect(result.record.facts.legalName.value).toBe("Štatistický úrad Slovenskej republiky");
    expect(result.record.facts.entityType?.value).toEqual({ code: "321", label: "Rozpočtová organizácia" });
    expect(result.record.facts.status?.value).toEqual({ canonical: "other", sourceLabel: "Aktívna" });
    expect(result.record.facts.registrationDate?.value).toBe("1992-01-01");
    expect(result.record.facts.registeredAddress?.value?.raw).toContain("Bratislava");
    expect(result.record.facts.industryCodes?.value).toEqual(["8411"]);
    expect(result.record.warnings[0]).toContain("up to 24 hours");
    expect(result.execution.cacheStatus).toBe("bypass-no-store");
  });

  it("maps non-null termination to dissolved while preserving the source status", async () => {
    const result = await slovakiaAdapter.lookup(
      request,
      context([upstream(200, searchFixture), upstream(200, { ...entityFixture, termination: "2020-01-01" })]),
    );
    expect(result.record.facts.status?.value?.canonical).toBe("dissolved");
    expect(result.record.facts.status?.sourceValue).toMatchObject({ value: { code: "1", value: "Aktívna" } });
  });

  it("does not present an ended historical address as the current registered address", async () => {
    const historicalOnly = {
      ...entityFixture,
      addresses: [{ formatedAddress: "Old address", validFrom: "2000-01-01", validTo: "2010-01-01" }],
    };
    const result = await slovakiaAdapter.lookup(
      request,
      context([upstream(200, searchFixture), upstream(200, historicalOnly)]),
    );
    expect(result.record.facts.registeredAddress).toBeUndefined();
  });

  it("turns an empty search result into NOT_FOUND without making the entity call", async () => {
    const urls: string[] = [];
    await expect(slovakiaAdapter.lookup(request, context([upstream(200, { results: [] })], urls))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(urls).toHaveLength(1);
  });

  it("fails closed for a missing current name or a mutated search id", async () => {
    await expect(
      slovakiaAdapter.lookup(request, context([upstream(200, searchFixture), upstream(200, { ...entityFixture, fullNames: [] })])),
    ).rejects.toMatchObject({ code: "SOURCE_SCHEMA_CHANGED" });
    await expect(slovakiaAdapter.lookup(request, context([upstream(200, { results: [{ id: "https://evil.test" }] })]))).rejects.toMatchObject({
      code: "SOURCE_SCHEMA_CHANGED",
    });
  });
});
