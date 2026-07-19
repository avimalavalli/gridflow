import { cookies } from "next/headers";
import { ApiError } from "./api";

const apiBase = process.env.GRIDFLOW_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

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
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      cache: "no-store",
      headers: cookieStore.size ? { cookie: cookieStore.toString() } : undefined,
    });
  } catch (error) {
    throw new ApiError(
      `GridFlow API is unavailable: ${error instanceof Error ? error.message : "unknown connection error"}`,
    );
  }
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}

export { ApiError } from "./api";
