import { describe, expect, it, vi } from "vitest";
import { Catalogue } from "../src/catalogue/catalogue";
import { serializePublicMachineCatalogue } from "../src/catalogue/public-catalogue";
import { decodePathSegment } from "../src/http/security";
import { WorkerSourceFetcher } from "../src/sources/source-fetcher";
import { fakeCatalogue } from "./fake-catalogue";

const sourcePolicy = [{
  sourceId: "test-source",
  allowedOrigins: ["https://official.example"],
  allowedPathPrefixes: ["/api/"],
  allowedMethods: ["GET" as const],
}];

describe("security boundaries", () => {
  it("turns malformed percent encoding into a domain validation error instead of a 500", () => {
    expect(() => decodePathSegment("%E0%A4%A", "identifier", 128)).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });

  it("does not expose internal evidence/manifests in public machine catalogue", () => {
    const output = serializePublicMachineCatalogue(new Catalogue(fakeCatalogue));
    expect(output).not.toHaveProperty("evidence");
    expect(output).not.toHaveProperty("adapterManifests");
    expect(output).not.toHaveProperty("verificationRecords");
  });

  it("blocks SSRF to a non-allowlisted origin before fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fetcher = new WorkerSourceFetcher(sourcePolicy);
    await expect(fetcher.request("test-source", { method: "GET", url: "https://attacker.example/api/x" }))
      .rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("blocks unexpected redirects rather than following them", async () => {
    let bodyCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() { bodyCancelled = true; },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, {
      status: 302,
      headers: { location: "https://attacker.example/steal" },
    }));
    const fetcher = new WorkerSourceFetcher(sourcePolicy);
    await expect(fetcher.request("test-source", { method: "GET", url: "https://official.example/api/x" }))
      .rejects.toMatchObject({ code: "SOURCE_BAD_RESPONSE" });
    expect(fetchSpy).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }));
    expect(bodyCancelled).toBe(true);
    fetchSpy.mockRestore();
  });

  it("blocks sensitive request headers unless a source policy explicitly allows them", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fetcher = new WorkerSourceFetcher(sourcePolicy);
    await expect(fetcher.request("test-source", {
      method: "GET",
      url: "https://official.example/api/x",
      headers: { authorization: "secret" },
    })).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
