import type { AuthTokens } from "@ewm/shared-types";
import { clearSession, getAccessToken, getRefreshToken, saveSession } from "./session";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    await clearSession();
    return null;
  }
  const tokens = await response.json() as AuthTokens;
  await saveSession(tokens);
  return tokens.accessToken;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = await getAccessToken();
  const request = () => fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  let response = await request();
  if (response.status === 401 && !refreshPromise) refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
  if (response.status === 401) {
    token = await (refreshPromise ?? Promise.resolve(null));
    if (token) response = await request();
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const body = await response.json(); if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : String(body.message); } catch { /* fallback */ }
    throw new Error(message);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const response = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error("Invalid email or password");
  const tokens = await response.json() as AuthTokens;
  await saveSession(tokens);
  return tokens;
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) await fetch(`${API_URL}/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  await clearSession();
}
