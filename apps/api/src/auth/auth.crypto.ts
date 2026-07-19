import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_COST = 16_384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;
const PASSWORD_MAX_MEMORY = 64 * 1024 * 1024;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, PASSWORD_KEY_LENGTH, {
    N: PASSWORD_COST,
    r: PASSWORD_BLOCK_SIZE,
    p: PASSWORD_PARALLELIZATION,
    maxmem: PASSWORD_MAX_MEMORY,
  })) as Buffer;

  return [
    "scrypt",
    PASSWORD_COST,
    PASSWORD_BLOCK_SIZE,
    PASSWORD_PARALLELIZATION,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    !costRaw ||
    !blockRaw ||
    !parallelRaw ||
    !saltRaw ||
    !hashRaw
  ) {
    return false;
  }

  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelization = Number(parallelRaw);
  if (![cost, blockSize, parallelization].every(Number.isInteger)) return false;

  try {
    const expected = Buffer.from(hashRaw, "base64url");
    const actual = (await scryptAsync(password, Buffer.from(saltRaw, "base64url"), expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: PASSWORD_MAX_MEMORY,
    })) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOrganisationSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "athlete";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}
