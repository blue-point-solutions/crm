import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "CardScannerConfirm">;

export default function CardScannerConfirmScreen({ navigation, route }: Props) {
  const { contactId, contactName, duplicatesCount } = route.params;

  const handleViewContact = useCallback(() => {
    navigation.replace("ContactDetail", { contactId });
  }, [navigation, contactId]);

  const handleScanAnother = useCallback(() => {
    navigation.navigate("CameraPermission");
  }, [navigation]);

  return (
    <View style={styles.root}>
      <Text style={styles.checkmark}>✓</Text>
      <Text style={styles.title}>Contact Saved</Text>
      <Text style={styles.subtitle}>
        {contactName ? `${contactName} has been added to your CRM.` : "The contact has been added to your CRM."}
      </Text>
      {duplicatesCount > 0 && (
        <Text style={styles.duplicateNote}>
          Heads up: {duplicatesCount === 1 ? "1 existing contact looks" : `${duplicatesCount} existing contacts look`} similar. You can review and merge from the contact list.
        </Text>
      )}

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
    fontFamily: "OmnesBold",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 12,
  },
  duplicateNote: {
    fontSize: 13,
    color: "#b7791f",
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  actions: {
    width: "100%",
    gap: 12,
    marginTop: 36,
  },
  primaryButton: {
    backgroundColor: "#0c4aad",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: "OmnesBold",
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
    fontFamily: "OmnesSemiBold",
    fontSize: 16,
  },
});
