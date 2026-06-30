import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "CardScannerConfirm">;

export default function CardScannerConfirmScreen({ navigation }: Props) {
  const handleViewContact = useCallback(() => {
    navigation.navigate("Contacts");
  }, [navigation]);

  const handleScanAnother = useCallback(() => {
    navigation.navigate("CameraPermission");
  }, [navigation]);

  return (
    <View style={styles.root}>
      <Text style={styles.checkmark}>✓</Text>
      <Text style={styles.title}>Contact Saved</Text>
      <Text style={styles.subtitle}>The contact has been added to your CRM.</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleViewContact}>
          <Text style={styles.primaryButtonText}>View Contact</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleScanAnother}>
          <Text style={styles.secondaryButtonText}>Scan Another</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  checkmark: {
    fontSize: 72,
    color: "#2ecc71",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 48,
  },
  actions: {
    width: "100%",
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  secondaryButtonText: {
    color: "#555",
    fontWeight: "600",
    fontSize: 16,
  },
});
