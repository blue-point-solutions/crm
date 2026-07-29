import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { TokenPair } from "../types/auth";

/**
 * Persistent session storage (security ticket #51): the token pair lives in
 * the OS keystore (Android Keystore / iOS Keychain) via expo-secure-store,
 * so a session survives cold starts without ever touching plain AsyncStorage.
 * On web (RN-Web e2e build) SecureStore is unavailable — sessions are
 * intentionally memory-only there.
 */

const ACCESS_KEY = "crm_session_access";
const REFRESH_KEY = "crm_session_refresh";

const available = Platform.OS !== "web";

export async function saveSession(tokens: TokenPair): Promise<void> {
  if (!available) return;
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.access_token);
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token);
}

export async function loadSession(): Promise<TokenPair | null> {
  if (!available) return null;
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  if (!access || !refresh) return null;
  return { access_token: access, refresh_token: refresh, token_type: "Bearer" };
}

export async function clearSession(): Promise<void> {
  if (!available) return;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
