import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import type { ChannelConfig } from "./channels.js";

// Minimal stateless subscriber token: base64url(payload).hmac. Avoids a JWT
// dependency for what is a single signed claim set.
// ponytail: HMAC-signed opaque token, swap for JWT lib if you need standard claims/rotation.

export interface TokenClaims {
  sub: string;
  channels: string[];
  exp: number;
  delivery?: ChannelConfig[]; // optional extra delivery sinks (webhook, email)
}

function sign(data: string): string {
  return createHmac("sha256", config.AUTH_SECRET).update(data).digest("base64url");
}

export function issueToken(claims: TokenClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): TokenClaims | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = sign(body);
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length || !timingSafeEqual(macBuf, expBuf)) {
    return null;
  }

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) {
    return null;
  }
  return claims;
}
