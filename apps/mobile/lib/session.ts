import * as SecureStore from "expo-secure-store";
import type { AuthTokens } from "@ewm/shared-types";

const ACCESS_KEY = "ewm.mobile.accessToken";
const REFRESH_KEY = "ewm.mobile.refreshToken";

export type SessionUser = { sub: string; email: string; role: string; organisationId: string | null };

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function saveSession(tokens: AuthTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try { return JSON.parse(globalThis.atob(token.split(".")[1])) as SessionUser; } catch { return null; }
}
