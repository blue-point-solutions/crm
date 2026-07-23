import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Modal,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { parseCardImage } from "../utils/ocr";
import { OcrResult, ContactDraft } from "../types/contact";

type Props = NativeStackScreenProps<RootStackParamList, "CardScannerReview">;

// For demo purposes — a static duplicate example
const hasDuplicate = true;

const CONFIDENCE_THRESHOLD = 0.7;

function LowConfidenceField({
  label,
  value,
  onChangeText,
  confidence,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  confidence?: number;
  placeholder?: string;
}) {
  const isLow = confidence !== undefined && confidence < CONFIDENCE_THRESHOLD;
  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>
      {isLow && (
        <Text style={fieldStyles.warning}>
          ⚠️ OCR confidence is low — please verify this field
        </Text>
      )}
      <TextInput
        style={[fieldStyles.input, isLow && fieldStyles.inputLow]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 4 },
  warning: { fontSize: 11, color: "#f39c12", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1a1a1a",
    backgroundColor: "#fafafa",
  },
  inputLow: { backgroundColor: "#fff8e1", borderColor: "#f39c12" },
});

function ocrValue(field?: { value: string }): string {
  return field?.value ?? "";
}

export default function CardScannerReviewScreen({ navigation, route }: Props) {
  const { imageUri } = route.params;
  const insets = useSafeAreaInsets();

  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [imageModalVisible, setImageModalVisible] = useState(false);

  const [draft, setDraft] = useState<ContactDraft>({
    firstName: "",
    lastName: "",
    jobTitle: "",
    company: "",
    phones: [],
    emails: [],
    website: "",
    address: "",
    linkedin: "",
    facebook: "",
    cardImageUri: imageUri,
    saveCardImage: true,
    source: null,
    tags: [],
    status: "Lead",
    marketingConsent: null,
    decisionMaker: "Unknown",
    leadTemperature: null,
    interests: [],
    painPoint: "",
    notes: "",
    followUpDate: undefined,
  });

  useEffect(() => {
    let cancelled = false;
    parseCardImage(imageUri).then((result) => {
      if (cancelled) return;
      setOcr(result);
      setDraft((d) => ({
        ...d,
        firstName: ocrValue(result.firstName),
        lastName: ocrValue(result.lastName),
        jobTitle: ocrValue(result.jobTitle),
        company: ocrValue(result.company),
        phones: result.phones.map((p) => p.value),
        emails: result.emails.map((e) => e.value),
        website: ocrValue(result.website),
        address: ocrValue(result.address),
        linkedin: ocrValue(result.linkedin),
        facebook: ocrValue(result.facebook),
      }));
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [imageUri]);

  const update = useCallback(<K extends keyof ContactDraft>(key: K, val: ContactDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: val }));
  }, []);

  // Marketing Consent now lives on the next screen (Contact Details), so
  // this screen only needs a name present before continuing.
  const canSave = draft.firstName.trim().length > 0 || draft.lastName.trim().length > 0;

  const handleContinue = useCallback(() => {
    // Filter out empty/sparse entries before continuing
    const cleanDraft = {
      ...draft,
      phones: draft.phones.filter((p) => p && p.trim().length > 0),
      emails: draft.emails.filter((e) => e && e.trim().length > 0),
    };
    navigation.navigate("CardScannerContactDetails", { draft: cleanDraft });
  }, [draft, navigation]);

  const handleDiscard = useCallback(() => {
    Alert.alert(
      "Discard Card?",
      "All extracted information will be lost.",
      [
        { text: "Keep Editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => navigation.goBack() },
      ]
    );
  }, [navigation]);

  if (isLoading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#0c4aad" />
        <Text style={styles.loadingText}>Analysing card…</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
        {/* Card thumbnail */}
        <TouchableOpacity onPress={() => setImageModalVisible(true)} style={styles.thumbnailWrapper}>
          <Image source={{ uri: imageUri }} style={styles.thumbnail} resizeMode="cover" />
          <Text style={styles.thumbnailHint}>Tap to view full size</Text>
        </TouchableOpacity>

        {/* Duplicate alert */}
        {hasDuplicate && (
          <View style={styles.duplicateBanner}>
            <Text style={styles.duplicateText}>
              This contact may already exist.
            </Text>
            <View style={styles.duplicateActions}>
              <TouchableOpacity
                style={styles.duplicateBtn}
                onPress={() => navigation.navigate("Contacts")}
              >
                <Text style={styles.duplicateBtnText}>View Existing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.duplicateBtn} onPress={handleContinue}>
                <Text style={styles.duplicateBtnText}>Save as New</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Save card image toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Save card image</Text>
          <Switch
            value={draft.saveCardImage}
            onValueChange={(v) => update("saveCardImage", v)}
            trackColor={{ true: "#0c4aad" }}
          />
        </View>
        {!draft.saveCardImage && (
          <Text style={styles.toggleHint}>
            Card image will not be saved. Only the extracted contact details will be kept.
          </Text>
        )}

        {/* OCR Section */}
        <Text style={styles.sectionTitle}>Extracted Details</Text>

        <LowConfidenceField
          label="First Name"
          value={draft.firstName}
          onChangeText={(v) => update("firstName", v)}
          confidence={ocr?.firstName?.confidence}
        />
        <LowConfidenceField
          label="Last Name"
          value={draft.lastName}
          onChangeText={(v) => update("lastName", v)}
          confidence={ocr?.lastName?.confidence}
        />
        <LowConfidenceField
          label="Job Title"
          value={draft.jobTitle}
          onChangeText={(v) => update("jobTitle", v)}
          confidence={ocr?.jobTitle?.confidence}
        />
        <LowConfidenceField
          label="Company"
          value={draft.company}
          onChangeText={(v) => update("company", v)}
          confidence={ocr?.company?.confidence}
        />

        {/* Phones */}
        {[0, 1, 2].map((i) => (
          <LowConfidenceField
            key={`phone-${i}`}
            label={`Phone ${i + 1}`}
            value={draft.phones[i] ?? ""}
            onChangeText={(v) => {
              const phones = [...draft.phones];
              phones[i] = v;
              update("phones", phones);
            }}
            confidence={ocr?.phones[i]?.confidence}
            placeholder="Enter phone number"
          />
        ))}

        {/* Emails */}
        {[0, 1, 2].map((i) => (
          <LowConfidenceField
            key={`email-${i}`}
            label={`Email ${i + 1}`}
            value={draft.emails[i] ?? ""}
            onChangeText={(v) => {
              const emails = [...draft.emails];
              emails[i] = v;
              update("emails", emails);
            }}
            confidence={ocr?.emails[i]?.confidence}
            placeholder="Enter email address"
          />
        ))}

        <LowConfidenceField
          label="Website"
          value={draft.website}
          onChangeText={(v) => update("website", v)}
          confidence={ocr?.website?.confidence}
        />
        <LowConfidenceField
          label="Address"
          value={draft.address}
          onChangeText={(v) => update("address", v)}
          confidence={ocr?.address?.confidence}
        />
        <LowConfidenceField
          label="LinkedIn (Optional)"
          value={draft.linkedin}
          onChangeText={(v) => update("linkedin", v)}
          confidence={ocr?.linkedin?.confidence}
        />
        <LowConfidenceField
          label="Facebook (Optional)"
          value={draft.facebook}
          onChangeText={(v) => update("facebook", v)}
          confidence={ocr?.facebook?.confidence}
        />

        {/* Bottom actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={handleContinue}
            disabled={!canSave}
          >
            <Text style={styles.saveButtonText}>Next</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.discardButton} onPress={handleDiscard}>
            <Text style={styles.discardButtonText}>Discard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Full-screen image modal */}
      <Modal visible={imageModalVisible} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setImageModalVisible(false)}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          <Image source={{ uri: imageUri }} style={styles.modalImage} resizeMode="contain" />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 48 },

  loadingRoot: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  loadingText: { fontSize: 16, color: "#555" },

  thumbnailWrapper: { marginBottom: 20, alignItems: "center" },
  thumbnail: { width: "100%", height: 180, borderRadius: 8 },
  thumbnailHint: { marginTop: 6, fontSize: 12, color: "#888" },

  duplicateBanner: {
    backgroundColor: "#fff3cd",
    borderWidth: 1,
    borderColor: "#ffc107",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  duplicateText: { fontSize: 14, color: "#856404", marginBottom: 8 },
  duplicateActions: { flexDirection: "row", gap: 8 },
  duplicateBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ffc107",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
  },
  duplicateBtnText: { fontSize: 13, color: "#856404", fontWeight: "600" },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  toggleLabel: { fontSize: 15, color: "#333", fontWeight: "500" },
  toggleHint: { fontSize: 12, color: "#888", marginBottom: 16 },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "OmnesBold",
    color: "#1a1a1a",
    marginTop: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 8,
  },

  actions: { marginTop: 24, gap: 12 },
  saveButton: {
    backgroundColor: "#0c4aad",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonDisabled: { backgroundColor: "#a0aec0" },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  discardButton: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e74c3c",
  },
  discardButtonText: { color: "#e74c3c", fontWeight: "600", fontSize: 16 },

  // Modal
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalClose: {
    position: "absolute",
    top: 52,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: { color: "#fff", fontSize: 20 },
  modalImage: { width: "95%", height: "70%" },
});
