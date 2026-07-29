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
  setBiometricPreference,
} from "../utils/biometrics";

type Props = NativeStackScreenProps<RootStackParamList, "BiometricConsent">;

export default function BiometricConsentScreen({ navigation }: Props) {
  const [biometricLabel, setBiometricLabel] = useState("Biometrics");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getBiometricType().then(setBiometricLabel);
  }, []);

  async function handleEnable() {
    setLoading(true);
    try {
      // The session token pair is already persisted in SecureStore by the
      // login call; enabling biometrics just adds the local unlock gate.
      await setBiometricPreference("enabled");
    } finally {
      setLoading(false);
      navigation.replace("Dashboard");
    }
  }

  async function handleNotNow() {
    await setBiometricPreference("declined");
    navigation.replace("Dashboard");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Faster Sign-In</Text>
      <Text style={styles.body}>
        Enable {biometricLabel} to sign in quickly.{"\n\n"}
        Your biometric data never leaves this device and is never sent to any server.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handleEnable}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Enable {biometricLabel}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skip}
        onPress={handleNotNow}
        disabled={loading}
      >
        <Text style={styles.skipText}>Not Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "OmnesBold",
    color: "#0c4aad",
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
    marginBottom: 40,
  },
  button: {
    backgroundColor: "#0c4aad",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontFamily: "OmnesSemiBold",
    fontSize: 16,
  },
  skip: {
    padding: 12,
    alignItems: "center",
  },
  skipText: {
    color: "#888",
    fontSize: 14,
  },
});
