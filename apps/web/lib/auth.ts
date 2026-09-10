"use client";

import type { AuthTokens } from "@ewm/shared-types";

// Minimal client-side session storage for the MVP web app.
// NOTE: for production the architecture prefers httpOnly refresh cookies
// (see docs/architecture.md §Risks); moving the refresh token out of
// localStorage is a hardening follow-up before any real customer data.
const ACCESS_TOKEN_KEY = "ewm.accessToken";
const REFRESH_TOKEN_KEY = "ewm.refreshToken";

export function storeSession(tokens: AuthTokens): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export interface SessionUser {
  sub: string;
  email: string;
  role: string;
  organisationId: string | null;
}

function decodeBase64UrlSegment(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const chars = Array.prototype.map.call(raw, (c: string) =>
    `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
  return decodeURIComponent(chars.join(""));
}

// Decodes the JWT payload without verifying the signature — client-side
// display only. Real authorization always happens server-side.
export function getSessionUser(): SessionUser | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const payload = JSON.parse(decodeBase64UrlSegment(payloadSegment));
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string,
      organisationId: payload.organisationId as string | null,
    };
  } catch {
    return null;
  }
}