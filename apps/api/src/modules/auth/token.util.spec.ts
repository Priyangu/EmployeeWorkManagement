import { generateOpaqueToken, hashOpaqueToken } from "./token.util";

describe("token.util", () => {
  it("generates a token and a matching hash", () => {
    const { token, tokenHash } = generateOpaqueToken();
    expect(token).toHaveLength(64); // 32 bytes as hex
    expect(tokenHash).toBe(hashOpaqueToken(token));
  });

  it("produces different tokens on each call", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("hashing the same token twice gives the same hash", () => {
    const { token } = generateOpaqueToken();
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it("never stores the raw token as its own hash", () => {
    const { token, tokenHash } = generateOpaqueToken();
    expect(tokenHash).not.toBe(token);
  });
});
