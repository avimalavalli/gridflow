export type SignupMode = "OPEN" | "CODE" | "CLOSED";

export interface ApiConfig {
  port: number;
  webOrigin: string;
  nodeEnv: "development" | "test" | "production";
  devBootstrap: boolean;
  devUserEmail: string;
  devUserName: string;
  devOrganisationName: string;
  devOrganisationSlug: string;
  signupMode: SignupMode;
  privateBetaCode: string;
  sessionCookieName: string;
  sessionDays: number;
  invitationDays: number;
  secureCookies: boolean;
  trustProxy: boolean;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected true or false, received: ${value}`);
}

function readPositiveInteger(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function loadConfig(): ApiConfig {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as ApiConfig["nodeEnv"];
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error(`Unsupported NODE_ENV: ${nodeEnv}`);
  }

  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }

  const devBootstrap = readBoolean(
    process.env.GRIDFLOW_DEV_BOOTSTRAP,
    nodeEnv !== "production",
  );
  if (nodeEnv === "production" && devBootstrap) {
    throw new Error("GRIDFLOW_DEV_BOOTSTRAP cannot be enabled in production.");
  }

  const defaultSignupMode: SignupMode = nodeEnv === "production" ? "CODE" : "OPEN";
  const signupMode = (process.env.AUTH_SIGNUP_MODE ?? defaultSignupMode) as SignupMode;
  if (!["OPEN", "CODE", "CLOSED"].includes(signupMode)) {
    throw new Error("AUTH_SIGNUP_MODE must be OPEN, CODE or CLOSED.");
  }
  const privateBetaCode = process.env.AUTH_PRIVATE_BETA_CODE ?? "";
  if (signupMode === "CODE" && privateBetaCode.length < 12) {
    throw new Error("AUTH_PRIVATE_BETA_CODE must contain at least 12 characters when signup mode is CODE.");
  }

  const secureCookies = readBoolean(
    process.env.AUTH_SECURE_COOKIES,
    nodeEnv === "production",
  );
  if (nodeEnv === "production" && !secureCookies) {
    throw new Error("AUTH_SECURE_COOKIES must be true in production.");
  }

  return {
    port,
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    nodeEnv,
    devBootstrap,
    devUserEmail: process.env.GRIDFLOW_DEV_USER_EMAIL ?? "developer@gridflow.local",
    devUserName: process.env.GRIDFLOW_DEV_USER_NAME ?? "GridFlow Developer",
    devOrganisationName:
      process.env.GRIDFLOW_DEV_ORGANISATION_NAME ?? "GridFlow Test Athlete",
    devOrganisationSlug:
      process.env.GRIDFLOW_DEV_ORGANISATION_SLUG ?? "gridflow-test-athlete-local",
    signupMode,
    privateBetaCode,
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME ?? "gridflow_session",
    sessionDays: readPositiveInteger("AUTH_SESSION_DAYS", process.env.AUTH_SESSION_DAYS, 30),
    invitationDays: readPositiveInteger("AUTH_INVITATION_DAYS", process.env.AUTH_INVITATION_DAYS, 7),
    secureCookies,
    trustProxy: readBoolean(process.env.TRUST_PROXY, nodeEnv === "production"),
  };
}

export const apiConfig = loadConfig();
