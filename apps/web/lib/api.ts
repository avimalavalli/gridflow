export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

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
  let response: Response;
  try {
    response = await fetch(`/backend${path}`, {
      cache: "no-store",
      credentials: "include",
    });
  } catch (error) {
    throw new ApiError(
      `GridFlow API is unavailable: ${error instanceof Error ? error.message : "unknown connection error"}`,
    );
  }
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/backend${path}`, {
      method: "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiError(
      `GridFlow API is unavailable: ${error instanceof Error ? error.message : "unknown connection error"}`,
    );
  }
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}
