import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { TokenPair } from "../types/auth";

/**
 * Persistent session storage (security ticket #51): the token pair lives in
 * the OS keystore (Android Keystore / iOS Keychain) via expo-secure-store,
 * so a session survives cold starts without ever touching plain AsyncStorage.
 * Stored as ONE JSON blob under ONE key — refresh tokens are single-use and
 * rotating, so a torn two-key write would strand a dead refresh token next
 * to a fresh access token. On web there is no OS keystore; the blob lives in
 * localStorage instead. That trades keystore-grade at-rest protection for a
 * session that survives a page refresh — acceptable because refresh tokens
 * are single-use with server-side replay detection (a stolen-and-replayed
 * token revokes the whole session family), and the alternative (memory-only)
 * makes the web app unusable.
 */

const SESSION_KEY = "crm_session_v2";
// Pre-v2 split keys — cleaned up on the next save/clear after update.
const LEGACY_ACCESS_KEY = "crm_session_access";
const LEGACY_REFRESH_KEY = "crm_session_refresh";

const isWeb = Platform.OS === "web";

function webStorage(): Storage | null {
  // localStorage can be absent or throw (SSR pass, privacy mode).
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export async function saveSession(tokens: TokenPair): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(
      SESSION_KEY,
      JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token })
    );
    return;
  }
  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token })
  );
  SecureStore.deleteItemAsync(LEGACY_ACCESS_KEY).catch(() => {});
  SecureStore.deleteItemAsync(LEGACY_REFRESH_KEY).catch(() => {});
}

export async function loadSession(): Promise<TokenPair | null> {
  if (isWeb) {
    const raw = webStorage()?.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const { access, refresh } = JSON.parse(raw);
      if (access && refresh) {
        return { access_token: access, refresh_token: refresh, token_type: "Bearer" };
      }
    } catch {
      // corrupt blob — treat as signed out
    }
    return null;
  }
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (raw) {
    try {
      const { access, refresh } = JSON.parse(raw);
      if (access && refresh) {
        return { access_token: access, refresh_token: refresh, token_type: "Bearer" };
      }
    } catch {
      // fall through to legacy / null
    }
  }
  // One-time migration from the split-key format.
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_ACCESS_KEY),
    SecureStore.getItemAsync(LEGACY_REFRESH_KEY),
  ]);
  if (!access || !refresh) return null;
  return { access_token: access, refresh_token: refresh, token_type: "Bearer" };
}

export async function clearSession(): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(LEGACY_ACCESS_KEY);
  await SecureStore.deleteItemAsync(LEGACY_REFRESH_KEY);
}
