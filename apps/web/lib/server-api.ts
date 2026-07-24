import { cookies } from "next/headers";
import { ApiError } from "./api";
import { serverApiBases } from "./api-base";

async function parseError(response: Response): Promise<ApiError> {
  let message = `GridFlow API returned ${response.status}.`;
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) message = payload.message.join(" ");
    else if (payload.message) message = payload.message;
  } catch {
    // Keep the HTTP status fallback.
  }
  return new ApiError(message, response.status);
}

export async function apiGet<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const headers = cookieStore.size ? { cookie: cookieStore.toString() } : undefined;
  const bases = serverApiBases();
  let lastConnectionError: unknown;

  for (const [index, base] of bases.entries()) {
    try {
      const response = await fetch(`${base}${path}`, {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw await parseError(response);
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastConnectionError = error;
      console.error(JSON.stringify({
        level: "error",
        event: "web-server-api-connection-failed",
        method: "GET",
        path,
        upstream: index === 0 ? "primary" : "fallback",
        fallbackAvailable: index < bases.length - 1,
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown connection error",
        timestamp: new Date().toISOString(),
      }));
    }
  }

  throw new ApiError(
    `GridFlow API is unavailable: ${lastConnectionError instanceof Error ? lastConnectionError.message : "unknown connection error"}`,
  );
}

export { ApiError } from "./api";
