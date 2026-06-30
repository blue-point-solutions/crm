import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "BiometricConsent">;

export default function BiometricConsentScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Faster Sign-In</Text>
      <Text style={styles.body}>
        Enable Face ID / Fingerprint to sign in quickly.{"\n\n"}
        Your biometric data never leaves this device and is never sent to any server.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.replace("Dashboard")}
      >
        <Text style={styles.buttonText}>Enable Biometrics</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.skip}
        onPress={() => navigation.replace("Dashboard")}
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
