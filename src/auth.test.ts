import { describe, it, expect } from "vitest";
import { issueToken, verifyToken } from "./auth.js";

describe("auth tokens", () => {
  const claims = { sub: "user-1", channels: ["alerts", "news"], exp: Math.floor(Date.now() / 1000) + 3600 };

  it("round-trips valid token", () => {
    const token = issueToken(claims);
    const result = verifyToken(token);
    expect(result).toMatchObject({ sub: "user-1", channels: ["alerts", "news"] });
  });

  it("rejects tampered token", () => {
    const token = issueToken(claims);
    expect(verifyToken(token.slice(0, -3) + "xxx")).toBeNull();
  });

  it("rejects expired token", () => {
    const expired = issueToken({ ...claims, exp: Math.floor(Date.now() / 1000) - 1 });
    expect(verifyToken(expired)).toBeNull();
  });

  it("rejects malformed token", () => {
    expect(verifyToken("notavalidtoken")).toBeNull();
  });
});
