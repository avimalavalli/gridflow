import { createHmac, randomBytes } from "node:crypto";
import { secureEqual } from "./token-crypto.js";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

export interface GmailOAuthState {
  tenantId: string;
  userId: string;
  expiresAt: number;
  nonce: string;
  returnTo: string;
}

export interface GmailTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string };
    parts?: Array<unknown>;
  };
}

export interface GmailHistoryResponse {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{ message: GmailMessageSummary }>;
  }>;
  nextPageToken?: string;
  historyId: string;
}

export interface GmailSendResult {
  id: string;
  threadId: string;
  labelIds?: string[];
}

export interface GmailDraftResult {
  id: string;
  message: GmailSendResult;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function oauthConfig(config?: Partial<GmailOAuthConfig>): GmailOAuthConfig {
  const resolved: GmailOAuthConfig = {
    clientId: config?.clientId ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: config?.clientSecret ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirectUri: config?.redirectUri ?? process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "",
    stateSecret: config?.stateSecret ?? process.env.GOOGLE_OAUTH_STATE_SECRET ?? process.env.INTEGRATION_ENCRYPTION_KEY ?? "",
  };
  for (const [name, value] of Object.entries(resolved)) {
    if (!value) throw new Error(`Gmail OAuth configuration is missing ${name}.`);
  }
  return resolved;
}

export function createGmailOAuthState(
  input: Omit<GmailOAuthState, "expiresAt" | "nonce"> & { ttlSeconds?: number },
  secret: string,
): string {
  const payload: GmailOAuthState = {
    tenantId: input.tenantId,
    userId: input.userId,
    returnTo: input.returnTo,
    expiresAt: Date.now() + (input.ttlSeconds ?? 600) * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGmailOAuthState(value: string, secret: string): GmailOAuthState {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) throw new Error("Invalid Gmail OAuth state.");
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!secureEqual(signature, expected)) throw new Error("Gmail OAuth state signature is invalid.");
  const parsed = JSON.parse(decodeBase64url(encoded)) as Partial<GmailOAuthState>;
  if (!parsed.tenantId || !parsed.userId || !parsed.returnTo || !parsed.expiresAt || !parsed.nonce) {
    throw new Error("Gmail OAuth state is incomplete.");
  }
  if (parsed.expiresAt < Date.now()) throw new Error("Gmail OAuth state has expired.");
  return parsed as GmailOAuthState;
}

export class GmailOAuthClient {
  private readonly config: GmailOAuthConfig;

  constructor(config?: Partial<GmailOAuthConfig>) {
    this.config = oauthConfig(config);
  }

  get stateSecret(): string { return this.config.stateSecret; }

  authorizationUrl(state: string): string {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<GmailTokenResponse> {
    return this.tokenRequest({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code",
    });
  }

  async refresh(refreshToken: string): Promise<GmailTokenResponse> {
    return this.tokenRequest({
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
    });
  }

  private async tokenRequest(payload: Record<string, string>): Promise<GmailTokenResponse> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(payload),
    });
    const body = await response.json() as GmailTokenResponse & { error?: string; error_description?: string };
    if (!response.ok || body.error) {
      throw new Error(`Google OAuth token exchange failed: ${body.error_description ?? body.error ?? response.statusText}`);
    }
    return body;
  }
}

function sanitiseHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function normaliseBody(value: string): string {
  return value.replace(/\r?\n/g, "\r\n");
}

export interface MimeMessageInput {
  to: string;
  from: string;
  subject: string;
  body: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export function buildMimeMessage(input: MimeMessageInput): string {
  const headers = [
    `To: ${sanitiseHeader(input.to)}`,
    `From: ${sanitiseHeader(input.from)}`,
    `Subject: ${sanitiseHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.messageId) headers.push(`Message-ID: ${sanitiseHeader(input.messageId)}`);
  if (input.inReplyTo) headers.push(`In-Reply-To: ${sanitiseHeader(input.inReplyTo)}`);
  if (input.references) headers.push(`References: ${sanitiseHeader(input.references)}`);
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${normaliseBody(input.body)}`, "utf8").toString("base64url");
}

export function gmailHeader(message: GmailMessageSummary, name: string): string | null {
  const found = message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function decodeBody(value: string | undefined): string {
  if (!value) return "";
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function plainTextFromPart(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType?.toLowerCase().startsWith("text/plain")) return decodeBody(part.body?.data);
  for (const child of part.parts ?? []) {
    const text = plainTextFromPart(child);
    if (text.trim()) return text;
  }
  return "";
}

function fallbackTextFromPart(part: GmailPart | undefined): string {
  if (!part) return "";
  for (const child of part.parts ?? []) {
    const text = fallbackTextFromPart(child);
    if (text.trim()) return text;
  }
  if (part.mimeType?.toLowerCase().startsWith("text/html")) {
    return decodeBody(part.body?.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ");
  }
  return decodeBody(part.body?.data);
}

export function gmailMessageText(message: GmailMessageSummary): string {
  const payload = message.payload as GmailPart | undefined;
  const text = (plainTextFromPart(payload) || fallbackTextFromPart(payload)).replace(/\0/g, "").trim();
  return (text || message.snippet || "").trim().slice(0, 20_000);
}

export function extractEmailAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const angled = value.match(/<([^>]+)>/);
  const candidate = (angled?.[1] ?? value).trim().toLowerCase();
  const match = candidate.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/i);
  return match?.[0]?.toLowerCase() ?? null;
}

export class GmailApiClient {
  constructor(private readonly accessToken: string) {}

  async profile(): Promise<GmailProfile> {
    return this.request<GmailProfile>("/users/me/profile");
  }

  async createDraft(raw: string, threadId?: string): Promise<GmailDraftResult> {
    return this.request<GmailDraftResult>("/users/me/drafts", {
      method: "POST",
      body: JSON.stringify({ message: { raw, ...(threadId ? { threadId } : {}) } }),
    });
  }

  async send(raw: string, threadId?: string): Promise<GmailSendResult> {
    return this.request<GmailSendResult>("/users/me/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
    });
  }

  async message(id: string): Promise<GmailMessageSummary> {
    return this.request<GmailMessageSummary>(`/users/me/messages/${encodeURIComponent(id)}?format=full`);
  }

  async listMessages(query: string, pageToken?: string): Promise<{ messages?: GmailMessageSummary[]; nextPageToken?: string }> {
    const params = new URLSearchParams({ maxResults: "100", q: query });
    if (pageToken) params.set("pageToken", pageToken);
    return this.request(`/users/me/messages?${params.toString()}`);
  }

  async history(startHistoryId: string, pageToken?: string): Promise<GmailHistoryResponse> {
    const params = new URLSearchParams({ startHistoryId, maxResults: "500", historyTypes: "messageAdded" });
    if (pageToken) params.set("pageToken", pageToken);
    return this.request(`/users/me/history?${params.toString()}`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) as T & { error?: { message?: string } } : {} as T & { error?: { message?: string } };
    if (!response.ok) {
      const error = new Error(`Gmail API request failed (${response.status}): ${body.error?.message ?? response.statusText}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return body;
  }
}
