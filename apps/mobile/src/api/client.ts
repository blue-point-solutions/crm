import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { TokenPair } from "../types/auth";
import { clearSession, loadSession, saveSession } from "./session";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export function setTokens(tokens: TokenPair) {
  _accessToken = tokens.access_token;
  _refreshToken = tokens.refresh_token;
  // Fire-and-forget: persistence failing (e.g. web) never blocks the session.
  saveSession(tokens).catch(() => {});
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  clearSession().catch(() => {});
}

/**
 * Cold-start session restore: loads the persisted token pair (if any) into
 * the in-memory client. Returns true when a session was restored — the 401
 * interceptor takes care of refreshing an expired access token on first use.
 */
export async function restoreSession(): Promise<boolean> {
  const stored = await loadSession();
  if (!stored) return false;
  _accessToken = stored.access_token;
  _refreshToken = stored.refresh_token;
  return true;
}

const client: AxiosInstance = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (_accessToken) {
    config.headers.set("Authorization", `Bearer ${_accessToken}`);
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && _refreshToken) {
      original._retry = true;
      try {
        const { data } = await axios.post<TokenPair>(
          `${BASE_URL}/auth/refresh`,
          { refresh_token: _refreshToken }
        );
        setTokens(data);
        original.headers["Authorization"] = `Bearer ${data.access_token}`;
        return client(original);
      } catch {
        clearTokens();
      }
    }
    return Promise.reject(err);
  }
);

export default client;
