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
  ActivityIndicator,
  Switch,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { parseCardImage } from "../utils/ocr";
import {
  OcrResult,
  ContactDraft,
  ContactSource,
  ContactStatus,
  MarketingConsent,
  DecisionMaker,
  LeadTemperature,
} from "../types/contact";

type Props = NativeStackScreenProps<RootStackParamList, "CardScannerReview">;

// For demo purposes — a static duplicate example
const hasDuplicate = true;

const CONFIDENCE_THRESHOLD = 0.7;

const SOURCE_OPTIONS: { label: string; value: ContactSource }[] = [
  { label: "BNI", value: "BNI" },
  { label: "Trade Show", value: "TradeShow" },
  { label: "Referral", value: "Referral" },
  { label: "Walk-in", value: "WalkIn" },
  { label: "Online", value: "Online" },
  { label: "Cold Outreach", value: "ColdOutreach" },
  { label: "Other", value: "Other" },
];

const STATUS_OPTIONS: { label: string; value: ContactStatus }[] = [
  { label: "Lead", value: "Lead" },
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
];

const TAG_OPTIONS = ["Client", "Prospect", "Partner", "Vendor", "VIP"];

function TriToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={toggleStyles.row}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[toggleStyles.btn, value === opt.value && toggleStyles.btnActive]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[toggleStyles.btnText, value === opt.value && toggleStyles.btnTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  btnText: { color: "#555", fontWeight: "500", fontSize: 13 },
  btnTextActive: { color: "#fff" },
});

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

  const toggleTag = useCallback((tag: string) => {
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag],
    }));
  }, []);

  const canSave =
    draft.marketingConsent !== null &&
    (draft.firstName.trim().length > 0 || draft.lastName.trim().length > 0);

  const handleSave = useCallback(() => {
    console.log("[CardScannerReview] Saving draft:", JSON.stringify(draft, null, 2));
    navigation.replace("CardScannerConfirm");
  }, [draft, navigation]);

  const handleDiscard = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  if (isLoading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Analysing card…</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
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
              <TouchableOpacity style={styles.duplicateBtn}>
                <Text style={styles.duplicateBtnText}>View Existing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.duplicateBtn}>
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
            trackColor={{ true: "#2563eb" }}
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
          label="LinkedIn"
          value={draft.linkedin}
          onChangeText={(v) => update("linkedin", v)}
          confidence={ocr?.linkedin?.confidence}
        />
        <LowConfidenceField
          label="Facebook"
          value={draft.facebook}
          onChangeText={(v) => update("facebook", v)}
          confidence={ocr?.facebook?.confidence}
        />

        {/* User-filled section */}
        <Text style={styles.sectionTitle}>Contact Details</Text>

        {/* Source */}
        <View style={fieldStyles.wrapper}>
          <Text style={fieldStyles.label}>Source</Text>
          <View style={styles.chipRow}>
            {SOURCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, draft.source === opt.value && styles.chipActive]}
                onPress={() => update("source", opt.value)}
              >
                <Text style={[styles.chipText, draft.source === opt.value && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tags */}
        <View style={fieldStyles.wrapper}>
          <Text style={fieldStyles.label}>Tags</Text>
          <View style={styles.chipRow}>
            {TAG_OPTIONS.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.chip, draft.tags.includes(tag) && styles.chipActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.chipText, draft.tags.includes(tag) && styles.chipTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Status */}
        <View style={fieldStyles.wrapper}>
          <Text style={fieldStyles.label}>Status</Text>
          <TriToggle<ContactStatus>
            options={STATUS_OPTIONS}
            value={draft.status}
            onChange={(v) => update("status", v)}
          />
        </View>

        {/* Marketing Consent — required */}
        <View style={fieldStyles.wrapper}>
          <Text style={[fieldStyles.label, styles.required]}>
            Marketing Consent <Text style={styles.asterisk}>*</Text>
          </Text>
          <TriToggle<MarketingConsent>
            options={[
              { label: "Yes", value: "Yes" },
              { label: "No", value: "No" },
              { label: "Not Asked", value: "NotAsked" },
            ]}
            value={draft.marketingConsent}
            onChange={(v) => update("marketingConsent", v)}
          />
        </View>

        {/* Decision Maker */}
        <View style={fieldStyles.wrapper}>
          <Text style={fieldStyles.label}>Decision Maker</Text>
          <TriToggle<DecisionMaker>
            options={[
              { label: "Yes", value: "Yes" },
              { label: "No", value: "No" },
              { label: "Unknown", value: "Unknown" },
            ]}
            value={draft.decisionMaker}
            onChange={(v) => update("decisionMaker", v)}
          />
        </View>

        {/* Lead Temperature */}
        <View style={fieldStyles.wrapper}>
          <Text style={fieldStyles.label}>Lead Temperature</Text>
          <TriToggle<LeadTemperature>
            options={[
              { label: "Hot", value: "Hot" },
              { label: "Warm", value: "Warm" },
              { label: "Cold", value: "Cold" },
            ]}
            value={draft.leadTemperature}
            onChange={(v) => update("leadTemperature", v)}
          />
        </View>

        {/* Notes */}
        <View style={fieldStyles.wrapper}>
          <Text style={fieldStyles.label}>Notes</Text>
          <TextInput
            style={[fieldStyles.input, styles.multiline]}
            value={draft.notes}
            onChangeText={(v) => update("notes", v)}
            placeholder="Add notes…"
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Follow-up Reminder */}
        <View style={fieldStyles.wrapper}>
          <Text style={fieldStyles.label}>Follow-up Reminder</Text>
          <TextInput
            style={fieldStyles.input}
            value={draft.followUpDate ?? ""}
            onChangeText={(v) => update("followUpDate", v || undefined)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
          />
        </View>

        {/* Bottom actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.saveButtonText}>Save Contact</Text>
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
    color: "#1a1a1a",
    marginTop: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 8,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipText: { fontSize: 13, color: "#555" },
  chipTextActive: { color: "#fff" },

  required: {},
  asterisk: { color: "#e74c3c" },

  multiline: { height: 100, textAlignVertical: "top" },

  actions: { marginTop: 24, gap: 12 },
  saveButton: {
    backgroundColor: "#2563eb",
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
