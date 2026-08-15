import { DomainError } from "../domain/errors";
import type { SourceFetcher, UpstreamRequest, UpstreamResponse } from "../lookup/types";

export interface SourceTransportPolicy {
  sourceId: string;
  allowedOrigins: string[];
  allowedPaths?: string[];
  allowedPathPrefixes: string[];
  allowedMethods: Array<UpstreamRequest["method"]>;
  allowedRequestHeaders?: string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Transport only. Licence, reuse, field exposure, and cache permission belong to PolicyGate.
 * Security is deny-by-default: every source must have an explicit transport allowlist.
 */
export class WorkerSourceFetcher implements SourceFetcher {
  private readonly policies = new Map<string, SourceTransportPolicy>();

  constructor(policies: SourceTransportPolicy[] = []) {
    for (const policy of policies) {
      if (this.policies.has(policy.sourceId)) throw new Error(`Duplicate source transport policy: ${policy.sourceId}`);
      this.policies.set(policy.sourceId, policy);
    }
  }

  async request(sourceId: string, request: UpstreamRequest): Promise<UpstreamResponse> {
    const policy = this.policies.get(sourceId);
    if (!policy) throw new DomainError("POLICY_BLOCKED", "No transport policy is configured for this official source");

    const url = this.validateRequest(sourceId, request, policy);
    const timeoutMs = policy.timeoutMs ?? 8_000;
    const maxResponseBytes = policy.maxResponseBytes ?? 2_000_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let responseBodyOwnsTimeout = false;

    try {
      const init: RequestInit = { method: request.method, signal: controller.signal, redirect: "manual" };
      if (request.headers) init.headers = request.headers;
      if (request.body !== undefined) init.body = request.body;
      const response = await fetch(url, init);

      if (response.status >= 300 && response.status < 400) {
        throw new DomainError("SOURCE_BAD_RESPONSE", "Official source returned an unexpected redirect", { sourceId, upstreamStatus: response.status });
      }
      if (response.status === 429) throw new DomainError("SOURCE_RATE_LIMITED", "Official source rate-limited the request", { sourceId });
      if (response.status === 401 || response.status === 403) throw new DomainError("SOURCE_AUTH_ERROR", "Official source rejected authentication/authorization", { sourceId });
      if (response.status >= 500) throw new DomainError("SOURCE_UNAVAILABLE", "Official source is unavailable", { sourceId, upstreamStatus: response.status });

      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel();
        return { status: response.status, headers: response.headers, body: null };
      }

      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        throw new DomainError("SOURCE_BAD_RESPONSE", "Official source response exceeds configured size limit", { sourceId });
      }

      const body = response.body
        ? this.boundedBody(response.body, sourceId, maxResponseBytes, controller.signal, () => clearTimeout(timeout))
        : null;
      responseBodyOwnsTimeout = body !== null;
      return {
        status: response.status,
        headers: response.headers,
        body,
      };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DomainError("SOURCE_TIMEOUT", "Official source request timed out", { sourceId });
      }
      throw new DomainError("SOURCE_UNAVAILABLE", "Official source transport failed", { sourceId });
    } finally {
      if (!responseBodyOwnsTimeout) clearTimeout(timeout);
    }
  }

  private validateRequest(sourceId: string, request: UpstreamRequest, policy: SourceTransportPolicy): URL {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      throw new DomainError("POLICY_BLOCKED", "Invalid official source URL", { sourceId });
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new DomainError("POLICY_BLOCKED", "Official source transport must use HTTPS without URL credentials", { sourceId });
    }
    if (!policy.allowedOrigins.includes(url.origin)) {
      throw new DomainError("POLICY_BLOCKED", "Official source origin is not allowlisted", { sourceId });
    }
    const pathAllowed = (policy.allowedPaths ?? []).includes(url.pathname)
      || policy.allowedPathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
    if (!pathAllowed) {
      throw new DomainError("POLICY_BLOCKED", "Official source path is not allowlisted", { sourceId });
    }
    if (!policy.allowedMethods.includes(request.method)) {
      throw new DomainError("POLICY_BLOCKED", "Official source HTTP method is not allowlisted", { sourceId });
    }

    const allowedHeaders = new Set((policy.allowedRequestHeaders ?? ["accept", "content-type"]).map((value) => value.toLowerCase()));
    for (const name of Object.keys(request.headers ?? {})) {
      if (!allowedHeaders.has(name.toLowerCase())) {
        throw new DomainError("POLICY_BLOCKED", "Official source request contains a non-allowlisted header", { sourceId });
      }
    }
    return url;
  }

  private boundedBody(
    body: ReadableStream<Uint8Array>,
    sourceId: string,
    limit: number,
    signal: AbortSignal,
    cleanup: () => void,
  ): ReadableStream<Uint8Array> {
    const reader = body.getReader();
    let total = 0;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            cleanup();
            controller.close();
            return;
          }
          total += next.value.byteLength;
          if (total > limit) {
            await reader.cancel();
            cleanup();
            controller.error(new DomainError("SOURCE_BAD_RESPONSE", "Official source response exceeds configured size limit", { sourceId }));
            return;
          }
          controller.enqueue(next.value);
        } catch {
          cleanup();
          controller.error(new DomainError(signal.aborted ? "SOURCE_TIMEOUT" : "SOURCE_BAD_RESPONSE", signal.aborted
            ? "Official source response body timed out"
            : "Official source response body could not be read", { sourceId }));
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          cleanup();
        }
      },
    });
  }
}
