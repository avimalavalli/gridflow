const LOCAL_API_URL = "http://127.0.0.1:3001/api/v1";

function normaliseApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function serverApiBase(): string {
  const configured = process.env.GRIDFLOW_API_URL ?? process.env.GRIDFLOW_API_PROXY_TARGET;
  if (configured?.trim()) return normaliseApiUrl(configured);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "GridFlow API is not configured. Set GRIDFLOW_API_URL on the web service.",
    );
  }

  return LOCAL_API_URL;
}
