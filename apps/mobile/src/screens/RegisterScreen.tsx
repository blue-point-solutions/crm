import React, { useState } from "react";
import {
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { register } from "../api/auth";
import { AppButton, AppTextInput } from "../components";
import { colors, spacing, type as typo } from "../theme";
import { getBiometricPreference, isBiometricAvailable } from "../utils/biometrics";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Mirrors platform-core's password policy so users hear about problems
 * before a round-trip: >=12 chars, at least one digit and one special. */
function passwordIssue(pw: string): string | undefined {
  if (pw.length < 12) return "At least 12 characters.";
  if (!/\d/.test(pw)) return "Include at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Include at least one special character.";
  return undefined;
}

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): boolean {
    const errs: FieldErrors = {};
    if (!name.trim()) errs.name = "Your name is required.";
    if (!EMAIL_RE.test(email.trim())) errs.email = "Enter a valid email address.";
    const pwIssue = passwordIssue(password);
    if (pwIssue) errs.password = pwIssue;
    if (confirm !== password) errs.confirm = "Passwords don't match.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleRegister() {
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim());
      // Same consent flow as login: offer biometrics once, on first entry.
      const available = await isBiometricAvailable();
      const preference = await getBiometricPreference();
      if (available && preference === null) {
        navigation.replace("BiometricConsent");
      } else {
        navigation.replace("Dashboard");
      }
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Get started with BP Connect</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <AppTextInput
          label="Full Name"
          placeholder="Juan dela Cruz"
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
          autoComplete="name"
        />
        <AppTextInput
          label="Email"
          placeholder="you@company.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
        />
        <AppTextInput
          label="Password"
          placeholder="12+ characters, a number and a symbol"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
        />
        <AppTextInput
          label="Confirm Password"
          placeholder="Repeat your password"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          error={fieldErrors.confirm}
        />

        <AppButton
          title="Create Account"
          onPress={handleRegister}
          loading={loading}
          disabled={loading}
        />

        <TouchableOpacity
          onPress={() => navigation.navigate("Login")}
          accessibilityRole="link"
        >
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    fontFamily: typo.family.bold,
    marginBottom: spacing.xs,
    color: colors.primary,
  },
  subtitle: {
    fontSize: typo.size.body,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  link: {
    textAlign: "center",
    color: colors.primary,
    fontSize: typo.size.caption + 1,
    marginTop: spacing.lg,
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md,
    fontSize: typo.size.caption + 1,
  },
});
