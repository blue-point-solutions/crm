import React, { useState } from "react";
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

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigation.replace("Dashboard");
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Login failed. Please try again.");
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
    marginBottom: 16,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  link: {
    textAlign: "center",
    color: "#0c4aad",
    fontSize: 14,
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
