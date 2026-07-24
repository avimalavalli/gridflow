import type { CoreAgentOutput } from "@gridflow/agents";

export class AgentEvidenceProvenanceError extends Error {
  readonly code = "AGENT_EVIDENCE_PROVENANCE_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "AgentEvidenceProvenanceError";
  }
}

function normaliseUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid$|fbclid$|ref$|source$)/i.test(parameter)) url.searchParams.delete(parameter);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    const query = url.searchParams.toString();
    return `${url.protocol.toLowerCase()}//${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function collectDeclaredEvidenceUrls(output: CoreAgentOutput): string[] {
  const urls = new Set<string>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    if (typeof record.url === "string" && typeof record.supported_fact === "string") {
      const normalised = normaliseUrl(record.url);
      if (normalised) urls.add(normalised);
    }
    for (const nested of Object.values(record)) visit(nested);
  };

  visit(output);
  return [...urls];
}

export function extractOpenAIWebSourceUrls(responseOutput: unknown): string[] {
  const urls = new Set<string>();
  if (!Array.isArray(responseOutput)) return [];

  for (const item of responseOutput) {
    if (!item || typeof item !== "object") continue;
    const outputItem = item as Record<string, unknown>;

    if (outputItem.type === "web_search_call") {
      const action = outputItem.action;
      if (action && typeof action === "object") {
        const sources = (action as Record<string, unknown>).sources;
        if (Array.isArray(sources)) {
          for (const source of sources) {
            if (!source || typeof source !== "object") continue;
            const url = (source as Record<string, unknown>).url;
            if (typeof url === "string") {
              const normalised = normaliseUrl(url);
              if (normalised) urls.add(normalised);
            }
          }
        }
      }
    }

    if (outputItem.type === "message" && Array.isArray(outputItem.content)) {
      for (const content of outputItem.content) {
        if (!content || typeof content !== "object") continue;
        const annotations = (content as Record<string, unknown>).annotations;
        if (!Array.isArray(annotations)) continue;
        for (const annotation of annotations) {
          if (!annotation || typeof annotation !== "object") continue;
          const annotationRecord = annotation as Record<string, unknown>;
          if (annotationRecord.type !== "url_citation" || typeof annotationRecord.url !== "string") continue;
          const normalised = normaliseUrl(annotationRecord.url);
          if (normalised) urls.add(normalised);
        }
      }
    }
  }

  return [...urls];
}

export function assertEvidenceBackedByWebSearch(output: CoreAgentOutput, responseOutput: unknown): void {
  const declared = collectDeclaredEvidenceUrls(output);
  if (declared.length === 0) return;

  const observed = new Set(extractOpenAIWebSourceUrls(responseOutput));
  if (observed.size === 0) {
    throw new AgentEvidenceProvenanceError(
      "The agent declared evidence URLs, but the OpenAI web-search response contained no verifiable source URLs.",
    );
  }

  const observedHosts = new Set([...observed].map(hostname).filter((host): host is string => Boolean(host)));
  const unsupported = declared.filter((url) => {
    if (observed.has(url)) return false;
    const declaredHost = hostname(url);
    return !declaredHost || !observedHosts.has(declaredHost);
  });
  if (unsupported.length > 0) {
    throw new AgentEvidenceProvenanceError(
      `The agent declared evidence that was not returned by web search: ${unsupported.join(", ")}`,
    );
  }
}
