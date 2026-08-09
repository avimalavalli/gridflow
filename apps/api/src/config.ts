export type SignupMode = "OPEN" | "CODE" | "ACTIVATION" | "CLOSED";

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
  platformAdminEmails: string[];
  sessionCookieName: string;
  sessionDays: number;
  deviceCookieName: string;
  deviceDays: number;
  invitationDays: number;
  secureCookies: boolean;
  trustProxy: boolean;
  passwordResetMinutes: number;
  loginLockoutAttempts: number;
  loginLockoutMinutes: number;
  mfaChallengeMinutes: number;
  authEncryptionKey: string;
  authMailProvider: "CONSOLE" | "RESEND";
  authFromEmail: string;
  resendApiKey: string;
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
  if (!["OPEN", "CODE", "ACTIVATION", "CLOSED"].includes(signupMode)) {
    throw new Error("AUTH_SIGNUP_MODE must be OPEN, CODE, ACTIVATION or CLOSED.");
  }
  const privateBetaCode = process.env.AUTH_PRIVATE_BETA_CODE ?? "";
  if (signupMode === "CODE" && privateBetaCode.length < 12) {
    throw new Error("AUTH_PRIVATE_BETA_CODE must contain at least 12 characters when signup mode is CODE.");
  }
  const platformAdminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (nodeEnv === "production" && signupMode === "ACTIVATION" && platformAdminEmails.length === 0) {
    throw new Error("PLATFORM_ADMIN_EMAILS is required when production signup mode is ACTIVATION.");
  }
  if (nodeEnv === "production" && signupMode === "ACTIVATION" && !(process.env.INTEGRATION_ENCRYPTION_KEY ?? "").trim()) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY is required when production signup mode is ACTIVATION.");
  }

  const secureCookies = readBoolean(
    process.env.AUTH_SECURE_COOKIES,
    nodeEnv === "production",
  );

  const authEncryptionKey = process.env.AUTH_ENCRYPTION_KEY ?? process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
  if (nodeEnv === "production" && authEncryptionKey.length < 32) {
    throw new Error("AUTH_ENCRYPTION_KEY must contain at least 32 characters in production.");
  }
  const authMailProvider = (process.env.AUTH_MAIL_PROVIDER ?? (nodeEnv === "production" ? "RESEND" : "CONSOLE")) as "CONSOLE" | "RESEND";
  if (!["CONSOLE", "RESEND"].includes(authMailProvider)) {
    throw new Error("AUTH_MAIL_PROVIDER must be CONSOLE or RESEND.");
  }
  const authFromEmail = process.env.AUTH_FROM_EMAIL ?? "GridFlow <no-reply@gridflow.local>";
  const resendApiKey = process.env.RESEND_API_KEY ?? "";
  if (nodeEnv === "production" && authMailProvider === "RESEND" && (!resendApiKey || !process.env.AUTH_FROM_EMAIL)) {
    throw new Error("RESEND_API_KEY and AUTH_FROM_EMAIL are required for production password recovery.");
  }
  if (nodeEnv === "production" && !secureCookies) {
    throw new Error("AUTH_SECURE_COOKIES must be true in production.");
  }

  const sessionCookieName = process.env.AUTH_SESSION_COOKIE_NAME ?? "gridflow_session";
  const deviceCookieName = process.env.AUTH_DEVICE_COOKIE_NAME ?? "gridflow_device";
  if (!sessionCookieName || !deviceCookieName || sessionCookieName === deviceCookieName) {
    throw new Error("Session and trusted-device cookie names must be non-empty and different.");
  }
  const sessionDays = readPositiveInteger("AUTH_SESSION_DAYS", process.env.AUTH_SESSION_DAYS, 30);
  const deviceDays = readPositiveInteger("AUTH_DEVICE_DAYS", process.env.AUTH_DEVICE_DAYS, 365);
  if (deviceDays < sessionDays) {
    throw new Error("AUTH_DEVICE_DAYS cannot be shorter than AUTH_SESSION_DAYS.");
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
    platformAdminEmails,
    sessionCookieName,
    sessionDays,
    deviceCookieName,
    deviceDays,
    invitationDays: readPositiveInteger("AUTH_INVITATION_DAYS", process.env.AUTH_INVITATION_DAYS, 7),
    secureCookies,
    trustProxy: readBoolean(process.env.TRUST_PROXY, nodeEnv === "production"),
    passwordResetMinutes: readPositiveInteger("AUTH_PASSWORD_RESET_MINUTES", process.env.AUTH_PASSWORD_RESET_MINUTES, 30),
    loginLockoutAttempts: readPositiveInteger("AUTH_LOGIN_LOCKOUT_ATTEMPTS", process.env.AUTH_LOGIN_LOCKOUT_ATTEMPTS, 8),
    loginLockoutMinutes: readPositiveInteger("AUTH_LOGIN_LOCKOUT_MINUTES", process.env.AUTH_LOGIN_LOCKOUT_MINUTES, 15),
    mfaChallengeMinutes: readPositiveInteger("AUTH_MFA_CHALLENGE_MINUTES", process.env.AUTH_MFA_CHALLENGE_MINUTES, 5),
    authEncryptionKey,
    authMailProvider,
    authFromEmail,
    resendApiKey,
  };
}

export const apiConfig = loadConfig();
