import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../lib/api-base";

export const dynamic = "force-dynamic";

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

async function proxy(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { path } = await context.params;
    const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
    const upstreamUrl = new URL(`${serverApiBase()}/${encodedPath}`);
    upstreamUrl.search = request.nextUrl.search;

    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders(request),
      body: body?.byteLength ? body : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: downstreamHeaders(upstream),
    });
  } catch (error) {
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
