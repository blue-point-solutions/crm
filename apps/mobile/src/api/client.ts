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

// Single-flight refresh: platform-core refresh tokens are single-use with
// replay detection — if two concurrent 401s each POSTed /auth/refresh with
// the same token, the second would look like token theft and revoke EVERY
// session for the user. All concurrent 401 retries must await one shared
// refresh promise.
let _refreshInFlight: Promise<boolean> | null = null;

function doRefresh(): Promise<boolean> {
  const token = _refreshToken;
  return axios
    .post<TokenPair>(`${BASE_URL}/auth/refresh`, { refresh_token: token })
    .then(({ data }) => {
      setTokens(data);
      return true;
    })
    .catch(() => {
      // Only wipe if nothing newer replaced the failed token in the
      // meantime (a successful concurrent refresh would have).
      if (_refreshToken === token) clearTokens();
      return false;
    });
}

// Web only: localStorage shares the single-use refresh token across tabs,
// and _refreshInFlight only dedupes within one tab — two tabs refreshing
// concurrently would trip platform-core's replay detection and revoke the
// whole session family. The Web Locks API serializes tabs; inside the lock,
// adopt a pair another tab already rotated instead of replaying ours.
function refreshCrossTab(): Promise<boolean> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return doRefresh();
  return locks.request("crm_session_refresh", async () => {
    const stored = await loadSession();
    if (stored && stored.refresh_token !== _refreshToken) {
      _accessToken = stored.access_token;
      _refreshToken = stored.refresh_token;
      return true;
    }
    return doRefresh();
  });
}

function refreshOnce(): Promise<boolean> {
  if (!_refreshInFlight) {
    _refreshInFlight = refreshCrossTab().finally(() => {
      _refreshInFlight = null;
    });
  }
  return _refreshInFlight;
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && _refreshToken) {
      original._retry = true;
      const refreshed = await refreshOnce();
      if (refreshed && _accessToken) {
        original.headers["Authorization"] = `Bearer ${_accessToken}`;
        return client(original);
      }
    }
    return Promise.reject(err);
  }
);

export default client;
