import { getAccessToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Authenticated fetch wrapper for the web app: attaches the stored JWT and
// surfaces API error messages (string or string[]) as Error instances.
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : String(body.message);
      }
    } catch {
      // keep the fallback message
    }
    throw new Error(message);
  }

  // 204/empty bodies have no JSON to parse.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
