import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { TokenPair } from "../types/auth";

/**
 * Persistent session storage (security ticket #51): the token pair lives in
 * the OS keystore (Android Keystore / iOS Keychain) via expo-secure-store,
 * so a session survives cold starts without ever touching plain AsyncStorage.
 * Stored as ONE JSON blob under ONE key — refresh tokens are single-use and
 * rotating, so a torn two-key write would strand a dead refresh token next
 * to a fresh access token. On web (RN-Web e2e build) SecureStore is
 * unavailable — sessions are intentionally memory-only there.
 */

const SESSION_KEY = "crm_session_v2";
// Pre-v2 split keys — cleaned up on the next save/clear after update.
const LEGACY_ACCESS_KEY = "crm_session_access";
const LEGACY_REFRESH_KEY = "crm_session_refresh";

const available = Platform.OS !== "web";

export async function saveSession(tokens: TokenPair): Promise<void> {
  if (!available) return;
  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token })
  );
  SecureStore.deleteItemAsync(LEGACY_ACCESS_KEY).catch(() => {});
  SecureStore.deleteItemAsync(LEGACY_REFRESH_KEY).catch(() => {});
}

export async function loadSession(): Promise<TokenPair | null> {
  if (!available) return null;
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
  if (!available) return;
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(LEGACY_ACCESS_KEY);
  await SecureStore.deleteItemAsync(LEGACY_REFRESH_KEY);
}
