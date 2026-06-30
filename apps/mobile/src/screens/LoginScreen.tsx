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
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { login } from "../api/auth";
import { setTokens } from "../api/client";
import {
  isBiometricAvailable,
  getBiometricType,
  getBiometricToken,
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

      const token = await getBiometricToken();
      if (token) {
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
        navigation.replace("BiometricConsent", {
          accessToken: tokens.access_token,
        });
      } else {
        navigation.replace("Home");
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

      const storedToken = await getBiometricToken();
      if (!storedToken) {
        setError("No stored credential found. Please sign in with your password.");
        return;
      }

      // Restore the locally stored token into the in-memory API client
      setTokens({ access_token: storedToken, refresh_token: "", token_type: "bearer" });
      navigation.replace("Home");
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
      <Text style={styles.title}>CRM</Text>
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
  title: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 4,
    color: "#1a1a2e",
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
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
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
    color: "#1a1a2e",
    fontSize: 14,
    marginTop: 4,
  },
  error: {
    color: "#c0392b",
    marginBottom: 12,
    fontSize: 14,
  },
});
