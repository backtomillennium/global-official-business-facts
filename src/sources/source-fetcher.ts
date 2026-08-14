import { DomainError } from "../domain/errors";
import type { SourceFetcher, UpstreamRequest, UpstreamResponse } from "../lookup/types";

/** Transport only. Licence, reuse, field exposure, and cache permission belong to PolicyGate. */
export class WorkerSourceFetcher implements SourceFetcher {
  constructor(
    private readonly timeoutMs = 8_000,
    private readonly maxResponseBytes = 2_000_000,
  ) {}

  async request(sourceId: string, request: UpstreamRequest): Promise<UpstreamResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const init: RequestInit = { method: request.method, signal: controller.signal };
      if (request.headers) init.headers = request.headers;
      if (request.body !== undefined) init.body = request.body;
      const response = await fetch(request.url, init);

      if (response.status === 429) throw new DomainError("SOURCE_RATE_LIMITED", "Official source rate-limited the request", { sourceId });
      if (response.status === 401 || response.status === 403) throw new DomainError("SOURCE_AUTH_ERROR", "Official source rejected authentication/authorization", { sourceId });
      if (response.status >= 500) throw new DomainError("SOURCE_UNAVAILABLE", "Official source is unavailable", { sourceId, upstreamStatus: response.status });

      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
        throw new DomainError("SOURCE_BAD_RESPONSE", "Official source response exceeds configured size limit", { sourceId });
      }

      return {
        status: response.status,
        headers: response.headers,
        body: response.body ? this.boundedBody(response.body, sourceId) : null,
      };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DomainError("SOURCE_TIMEOUT", "Official source request timed out", { sourceId });
      }
      throw new DomainError("SOURCE_UNAVAILABLE", "Official source transport failed", { sourceId });
    } finally {
      clearTimeout(timeout);
    }
  }

  private boundedBody(body: ReadableStream<Uint8Array>, sourceId: string): ReadableStream<Uint8Array> {
    const reader = body.getReader();
    let total = 0;
    const limit = this.maxResponseBytes;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await reader.read();
        if (next.done) {
          controller.close();
          return;
        }
        total += next.value.byteLength;
        if (total > limit) {
          await reader.cancel();
          controller.error(new DomainError("SOURCE_BAD_RESPONSE", "Official source response exceeds configured size limit", { sourceId }));
          return;
        }
        controller.enqueue(next.value);
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    });
  }
}
