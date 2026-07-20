import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

function keyFromSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed) throw new Error("INTEGRATION_ENCRYPTION_KEY is required.");

  // Accept a 32-byte base64url key, while still supporting a strong passphrase
  // in development by deterministically deriving a 32-byte key.
  try {
    const decoded = Buffer.from(trimmed, "base64url");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to SHA-256 derivation.
  }
  if (trimmed.length < 24) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be a 32-byte base64url key or a passphrase of at least 24 characters.");
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(secret = process.env.INTEGRATION_ENCRYPTION_KEY ?? "") {
    this.key = keyFromSecret(secret);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(payload: string): string {
    const [version, ivRaw, tagRaw, cipherRaw] = payload.split(".");
    if (version !== VERSION || !ivRaw || !tagRaw || !cipherRaw) {
      throw new Error("Encrypted integration token has an unsupported format.");
    }
    const iv = Buffer.from(ivRaw, "base64url");
    const tag = Buffer.from(tagRaw, "base64url");
    const ciphertext = Buffer.from(cipherRaw, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16) {
      throw new Error("Encrypted integration token is malformed.");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}

export function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
