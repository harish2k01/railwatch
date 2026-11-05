import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1";

/** Validates the configured base64 encryption key before cryptographic operations. */
function encryptionKey() {
  const configured = process.env.APP_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("APP_ENCRYPTION_KEY must be configured before sensitive values can be stored.");
  }

  const decoded = Buffer.from(configured, "base64");
  if (decoded.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return decoded;
}

/** Encrypts sensitive text with AES-256-GCM using a fresh nonce. */
export function encryptSecret(value: string) {
  if (value.startsWith(`${PREFIX}:`)) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

/** Decrypts stored values and supports historical plaintext inputs during migration. */
export function decryptSecret(value: string | null | undefined) {
  if (!value) return undefined;
  if (!value.startsWith(`${PREFIX}:`)) return value;

  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Encrypted value is malformed.");

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Checks whether a stored value uses the versioned encryption envelope. */
export function isEncrypted(value: string | null | undefined) {
  return Boolean(value?.startsWith(`${PREFIX}:`));
}

/** Produces a salted identifier for rate limiting without storing raw network identifiers. */
export function stableHash(value: string) {
  const salt = process.env.RATE_LIMIT_SALT ?? process.env.APP_ENCRYPTION_KEY ?? "RailWatch";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

const BYTES_VERSION = 1;
/** Encrypts raw bytes with AES-256-GCM as version(1) | iv(12) | tag(16) | ciphertext. */
export function encryptBytes(value: Uint8Array) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([Buffer.from([BYTES_VERSION]), iv, cipher.getAuthTag(), encrypted]);
}

/** Decrypts bytes produced by encryptBytes, rejecting unknown versions or tampered data. */
export function decryptBytes(value: Uint8Array) {
  const data = Buffer.from(value);
  if (data.length < 29 || data[0] !== BYTES_VERSION) throw new Error("Encrypted bytes are malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(1, 13));
  decipher.setAuthTag(data.subarray(13, 29));
  return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]);
}
