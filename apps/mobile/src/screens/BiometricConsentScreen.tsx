import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import {
  getBiometricType,
  storeBiometricToken,
  setBiometricPreference,
} from "../utils/biometrics";

type Props = NativeStackScreenProps<RootStackParamList, "BiometricConsent">;

export default function BiometricConsentScreen({ navigation, route }: Props) {
  const { accessToken } = route.params;
  const [biometricLabel, setBiometricLabel] = useState("Biometrics");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getBiometricType().then(setBiometricLabel);
  }, []);

  async function handleEnable() {
    setLoading(true);
    try {
      await storeBiometricToken(accessToken);
      await setBiometricPreference("enabled");
    } finally {
      setLoading(false);
      navigation.replace("Home");
    }
  }

  async function handleNotNow() {
    await setBiometricPreference("declined");
    navigation.replace("Home");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Faster Sign-In</Text>
      <Text style={styles.body}>
        Enable {biometricLabel} to sign in quickly. Your biometric data never
        leaves this device and is never sent to any server.
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleEnable}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Enable {biometricLabel}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={handleNotNow}
        disabled={loading}
      >
        <Text style={styles.secondaryButtonText}>Not Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 16,
    textAlign: "center",
  },
  body: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 40,
  },
  primaryButton: {
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#1a1a2e",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
  },
  secondaryButtonText: {
    color: "#1a1a2e",
    fontWeight: "600",
    fontSize: 16,
  },
});
