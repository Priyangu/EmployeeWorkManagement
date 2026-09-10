import { randomBytes, createHash } from "crypto";

// Opaque tokens (password reset, email verification) are random bytes sent
// to the user, but only their SHA-256 hash is stored — so a DB read alone
// can never be used to reset someone's password or verify their email.
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashOpaqueToken(token);
  return { token, tokenHash };
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
