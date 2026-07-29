import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { createContact } from "../api/contacts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import {
  ContactDraft,
  ContactSource,
  ContactStatus,
  MarketingConsent,
  DecisionMaker,
  LeadTemperature,
} from "../types/contact";

type Props = NativeStackScreenProps<RootStackParamList, "CardScannerContactDetails">;

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
  testIDPrefix,
}: {
  options: { label: string; value: T }[];
  value: T | null;
  onChange: (v: T) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={toggleStyles.row}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          testID={testIDPrefix ? `${testIDPrefix}-${opt.value}` : undefined}
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
  btnActive: { backgroundColor: "#0c4aad", borderColor: "#0c4aad" },
  btnText: { color: "#555", fontWeight: "500", fontSize: 13 },
  btnTextActive: { color: "#fff" },
});

export default function CardScannerContactDetailsScreen({ navigation, route }: Props) {
  const { draft: incomingDraft } = route.params;
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<ContactDraft>(incomingDraft);

  const update = useCallback(<K extends keyof ContactDraft>(key: K, val: ContactDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: val }));
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag],
    }));
  }, []);

  const [saving, setSaving] = useState(false);

  const canSave =
    draft.marketingConsent !== null &&
    (draft.firstName.trim() !== "" || draft.lastName.trim() !== "") &&
    !saving;

  const handleSave = useCallback(async () => {
    if (draft.marketingConsent === null) return;
    setSaving(true);
    try {
      // Follow-up is a plain YYYY-MM-DD from the form; send only if it parses.
      const followUp =
        draft.followUpDate && /^\d{4}-\d{2}-\d{2}$/.test(draft.followUpDate)
          ? `${draft.followUpDate}T09:00:00Z`
          : undefined;
      const created = await createContact({
        firstName: draft.firstName,
        lastName: draft.lastName,
        jobTitle: draft.jobTitle || undefined,
        company: draft.company || undefined,
        phones: draft.phones.filter(Boolean),
        emails: draft.emails.filter(Boolean),
        website: draft.website || undefined,
        address: draft.address || undefined,
        linkedin: draft.linkedin || undefined,
        facebook: draft.facebook || undefined,
        // cardImageUri is a local file:// path — server-side card image
        // storage (R2 upload) is a separate ticket; not sent yet.
        industry: undefined,
        source: draft.source ?? undefined,
        tags: draft.tags,
        interests: draft.interests,
        status: draft.status,
        marketingConsent: draft.marketingConsent,
        decisionMaker: draft.decisionMaker,
        leadTemperature: draft.leadTemperature ?? undefined,
        notes: draft.notes,
        painPoint: draft.painPoint || undefined,
        followUpDate: followUp,
        sourceMethod: "Card Scan",
      });
      navigation.replace("CardScannerConfirm", {
        contactId: created.id,
        contactName: `${created.firstName} ${created.lastName}`.trim(),
        duplicatesCount: created.duplicates.length,
      });
    } catch (e: any) {
      Alert.alert(
        "Couldn't Save Contact",
        e.response?.data?.detail ?? "Check your connection and try again.",
        [{ text: "OK" }]
      );
    } finally {
      setSaving(false);
    }
  }, [draft, navigation]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backButtonText}>‹ Back to Details</Text>
      </TouchableOpacity>

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
          testIDPrefix="marketing-consent"
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
          testIDPrefix="decision-maker"
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
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Contact</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const fieldStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 4 },
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
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 48 },

  backButton: { marginBottom: 16 },
  backButtonText: { fontSize: 15, color: "#0c4aad", fontWeight: "600" },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "OmnesBold",
    color: "#1a1a1a",
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
  chipActive: { backgroundColor: "#0c4aad", borderColor: "#0c4aad" },
  chipText: { fontSize: 13, color: "#555" },
  chipTextActive: { color: "#fff" },

  required: {},
  asterisk: { color: "#e74c3c" },

  multiline: { height: 100, textAlignVertical: "top" },

  actions: { marginTop: 24, gap: 12 },
  saveButton: {
    backgroundColor: "#0c4aad",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonDisabled: { backgroundColor: "#a0aec0" },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
