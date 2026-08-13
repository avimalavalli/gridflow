import { NextRequest, NextResponse } from "next/server";
import { serverApiBases } from "../../../lib/api-base";

export const dynamic = "force-dynamic";
const MAX_PROXY_BODY_BYTES = 512 * 1024;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

function upstreamHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  headers.set("x-forwarded-host", request.headers.get("host") ?? request.nextUrl.host);
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
  return headers;
}

function downstreamHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const [name, value] of upstream.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== "set-cookie") {
      headers.append(name, value);
    }
  }

  for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie", cookie);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  return headers;
}

function connectionMessage(error: unknown): string {
  if (!(error instanceof Error)) return "unknown connection error";
  return error.message.slice(0, 300);
}

async function readBoundedBody(request: NextRequest): Promise<ArrayBuffer | undefined> {
  if (!request.body) return undefined;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_PROXY_BODY_BYTES) {
    throw new RangeError("GridFlow request body is too large.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROXY_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("GridFlow request body is too large.");
    }
    chunks.push(value);
  }
  if (!total) return undefined;
  const buffer = new ArrayBuffer(total);
  const body = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { path } = await context.params;
    const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await readBoundedBody(request);
    const headers = upstreamHeaders(request);
    const bases = serverApiBases();
    let lastConnectionError: unknown;

    for (const [index, base] of bases.entries()) {
      const upstreamUrl = new URL(`${base}/${encodedPath}`);
      upstreamUrl.search = request.nextUrl.search;

      try {
        const upstream = await fetch(upstreamUrl, {
          method,
          headers,
          body: body?.byteLength ? body : undefined,
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
        });

        return new NextResponse(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: downstreamHeaders(upstream),
        });
      } catch (error) {
        lastConnectionError = error;
        console.error(JSON.stringify({
          level: "error",
          event: "web-api-proxy-connection-failed",
          method,
          path: `/${encodedPath}`,
          upstream: index === 0 ? "primary" : "fallback",
          fallbackAvailable: index < bases.length - 1,
          message: connectionMessage(error),
          timestamp: new Date().toISOString(),
        }));
      }
    }

    throw lastConnectionError ?? new Error("No GridFlow API endpoint was available.");
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json(
        { statusCode: 413, message: "GridFlow accepts request bodies up to 512 KB.", error: "Payload Too Large" },
        { status: 413, headers: { "cache-control": "no-store" } },
      );
    }
    const configurationError = error instanceof Error && error.message.includes("not configured");
    return NextResponse.json(
      {
        statusCode: configurationError ? 503 : 502,
        message: configurationError
          ? "GridFlow API is not configured on the web service."
          : "GridFlow could not reach the API service.",
        error: configurationError ? "Service Unavailable" : "Bad Gateway",
      },
      {
        status: configurationError ? 503 : 502,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
