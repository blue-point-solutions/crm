import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { login } from "../api/auth";
import { restoreSession } from "../api/client";
import { loadSession } from "../api/session";
import {
  isBiometricAvailable,
  getBiometricType,
  getBiometricPreference,
  authenticateWithBiometrics,
} from "../utils/biometrics";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometrics");

  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable();
      if (!available) return;
      setBiometricAvailable(true);

      const label = await getBiometricType();
      setBiometricLabel(label);

      // Biometric quick-unlock is offered when the user opted in AND a
      // persisted session exists to unlock.
      const [preference, session] = await Promise.all([
        getBiometricPreference(),
        loadSession(),
      ]);
      if (preference === "enabled" && session) {
        setBiometricEnrolled(true);
      }
    })();
  }, []);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const tokens = await login(email.trim(), password);

      // Check whether we should prompt for biometric consent
      const preference = await getBiometricPreference();
      const available = await isBiometricAvailable();

      if (available && preference === null) {
        // First login — ask the user to opt in (separate explicit consent)
        navigation.replace("BiometricConsent");
      } else {
        navigation.replace("Dashboard");
      }
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    setLoading(true);
    try {
      const success = await authenticateWithBiometrics();
      if (!success) {
        setError("Biometric authentication failed. Please sign in with your password.");
        return;
      }

      // Biometrics passed — unlock the persisted session (full token pair,
      // so the 401-refresh path keeps working after the access token expires).
      const restored = await restoreSession();
      if (!restored) {
        setError("No stored session found. Please sign in with your password.");
        return;
      }
      navigation.replace("Dashboard");
    } catch {
      setError("Biometric authentication failed. Please sign in with your password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* App name */}
      <Text style={styles.appName}>BP Connect</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      {biometricAvailable && biometricEnrolled && (
        <TouchableOpacity
          style={styles.biometricButton}
          onPress={handleBiometricLogin}
          disabled={loading}
        >
          <Text style={styles.biometricButtonText}>
            Use {biometricLabel}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.link}>Don't have an account? Register</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.devButton}
        onPress={() => navigation.replace("Dashboard")}
      >
        <Text style={styles.devButtonText}>⚡ Dev: Skip Login</Text>
      </TouchableOpacity>

      {/* Powered by Blue Point Solutions */}
      <View style={styles.poweredBy}>
        <Text style={styles.poweredByText}>Powered by</Text>
        <Image
          source={require("../../assets/bp-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  appName: {
    fontSize: 36,
    fontWeight: "800",
    fontFamily: "OmnesBold",
    marginBottom: 4,
    color: "#0c4aad",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  button: {
    backgroundColor: "#0c4aad",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontFamily: "OmnesSemiBold",
    fontSize: 16,
  },
  biometricButton: {
    borderWidth: 1,
    borderColor: "#1a1a2e",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  biometricButtonText: {
    color: "#1a1a2e",
    fontWeight: "600",
    fontSize: 15,
  },
  link: {
    textAlign: "center",
    color: "#0c4aad",
    fontSize: 14,
    marginTop: 4,
  },
  error: {
    color: "#c0392b",
    marginBottom: 12,
    fontSize: 14,
  },
  devButton: {
    marginTop: 20,
    padding: 10,
    alignItems: "center",
  },
  devButtonText: {
    color: "#aaa",
    fontSize: 12,
  },
  poweredBy: {
    alignItems: "center",
    marginTop: 32,
  },
  poweredByText: {
    fontSize: 11,
    color: "#999",
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  logo: {
    width: 160,
    height: 44,
  },
});
