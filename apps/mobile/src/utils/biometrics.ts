import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_TOKEN_KEY = "crm_biometric_token";
const BIOMETRIC_PREFERENCE_KEY = "crm_biometric_preference";

/**
 * Checks if the device hardware supports biometric authentication
 * and has enrolled biometric data.
 * Biometric data never leaves the device.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

/**
 * Returns a human-readable label for the available biometric type.
 * Defaults to "Fingerprint" if type cannot be determined.
 */
export async function getBiometricType(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    // iOS reports Face ID as FACIAL_RECOGNITION
    return "Face ID";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    // iOS Touch ID or Android fingerprint
    // On iOS, FINGERPRINT maps to Touch ID
    return "Touch ID";
  }
  return "Fingerprint";
}

/**
 * Prompts the user with a biometric authentication dialog.
 * Returns true on success, false on failure or cancellation.
 * No biometric data is read or transmitted — the OS handles everything locally.
 */
export async function authenticateWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Sign in to CRM",
    cancelLabel: "Use Password",
    disableDeviceFallback: false,
  });
  return result.success;
}

/**
 * Stores the JWT access token in the device's secure enclave / keystore.
 * The token never leaves the device via this utility.
 */
export async function storeBiometricToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, token);
}

/**
 * Retrieves the stored JWT access token from SecureStore.
 * Returns null if no token has been stored.
 */
export async function getBiometricToken(): Promise<string | null> {
  return SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
}

/**
 * Removes the stored biometric token and preference from SecureStore.
 * Call this on sign-out to ensure the token is purged from the device.
 */
export async function clearBiometricToken(): Promise<void> {
  await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_PREFERENCE_KEY);
}

/**
 * Persists the user's biometric opt-in preference ("enabled" | "declined").
 */
export async function setBiometricPreference(
  preference: "enabled" | "declined"
): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_PREFERENCE_KEY, preference);
}

/**
 * Reads the user's biometric preference.
 * Returns null if the user has not yet been asked.
 */
export async function getBiometricPreference(): Promise<string | null> {
  return SecureStore.getItemAsync(BIOMETRIC_PREFERENCE_KEY);
}
