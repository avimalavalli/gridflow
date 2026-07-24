const LOCAL_API_URL = "http://127.0.0.1:3001/api/v1";

function normaliseApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function serverApiBases(): string[] {
  const configured = process.env.GRIDFLOW_API_URL ?? process.env.GRIDFLOW_API_PROXY_TARGET;
  const fallback = process.env.GRIDFLOW_API_FALLBACK_URL;

  const bases = [configured, fallback]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normaliseApiUrl);

  if (bases.length > 0) return [...new Set(bases)];

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "GridFlow API is not configured. Set GRIDFLOW_API_URL on the web service.",
    );
  }

  return [LOCAL_API_URL];
}

export function serverApiBase(): string {
  return serverApiBases()[0];
}
