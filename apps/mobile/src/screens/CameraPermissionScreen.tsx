import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { requestCameraPermission, requestPhotoLibraryPermission } from "../utils/permissions";

type Props = NativeStackScreenProps<RootStackParamList, "CameraPermission">;

export default function CameraPermissionScreen({ navigation }: Props) {
  const [denied, setDenied] = useState(false);

  const handleAllowAccess = useCallback(async () => {
    const granted = await requestCameraPermission();
    if (granted) {
      navigation.replace("CardScanner");
    } else {
      setDenied(true);
    }
  }, [navigation]);

  const handleNotNow = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleImportFromPhotos = useCallback(async () => {
    const granted = await requestPhotoLibraryPermission();
    if (!granted) {
      Alert.alert("Permission Required", "Photo library access is needed to import images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
    });

    if (!result.canceled && result.assets.length > 0) {
      navigation.replace("CardScannerReview", { imageUri: result.assets[0].uri });
    }
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.title}>Scan Business Cards</Text>
        <Text style={styles.body}>
          To scan business cards and extract contact details automatically, the app needs access to
          your camera.
        </Text>

        {denied && (
          <View style={styles.fallbackBanner}>
            <Text style={styles.fallbackText}>
              Camera access was denied. You can still import a card photo from your photo library.
            </Text>
            <TouchableOpacity style={styles.importButton} onPress={handleImportFromPhotos}>
              <Text style={styles.importButtonText}>Import from Photos</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {!denied && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleAllowAccess}>
            <Text style={styles.primaryButtonText}>Allow Access</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={handleNotNow}>
          <Text style={styles.secondaryButtonText}>Not Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 48,
  },
  content: {
    flex: 1,
    alignItems: "center",
  },
  icon: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
    lineHeight: 24,
  },
  fallbackBanner: {
    marginTop: 32,
    backgroundColor: "#fff8e1",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f39c12",
    width: "100%",
  },
  fallbackText: {
    fontSize: 14,
    color: "#7d6608",
    marginBottom: 12,
    lineHeight: 20,
  },
  importButton: {
    backgroundColor: "#f39c12",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  importButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  actions: {
    gap: 12,
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
