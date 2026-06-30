import React, { useState, useLayoutEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Modal,
  Image,
  Alert,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/types";
import { ContactDetail, Activity, getMockContactDetail, updateContact } from "../api/contacts";

type ContactDetailNavProp = NativeStackNavigationProp<RootStackParamList, "ContactDetail">;
type ContactDetailRouteProp = RouteProp<RootStackParamList, "ContactDetail">;

// ─── Helpers ───────────────────────────────────────────────────────────────

type LeadTemp = "Hot" | "Warm" | "Cold";

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function avatarColor(temp?: string): string {
  switch (temp) {
    case "Hot":  return "#e53935";
    case "Warm": return "#fb8c00";
    case "Cold": return "#1e88e5";
    default:     return "#757575";
  }
}

function tempLabel(temp?: string): string {
  switch (temp) {
    case "Hot":  return "🔥 Hot";
    case "Warm": return "🌡 Warm";
    case "Cold": return "❄️ Cold";
    default:     return "—";
  }
}

function completenessBarColor(score: number): string {
  if (score >= 80) return "#43a047";
  if (score >= 50) return "#ffb300";
  return "#e53935";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function activityIcon(type: Activity["type"]): string {
  switch (type) {
    case "call":    return "📞";
    case "email":   return "✉️";
    case "meeting": return "🤝";
    case "note":
    default:        return "📝";
  }
}

function consentColor(consent: ContactDetail["marketingConsent"]): string {
  switch (consent) {
    case "Yes": return "#43a047";
    case "No":  return "#e53935";
    default:    return "#9e9e9e";
  }
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() =>
    Alert.alert("Cannot open link", url)
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionDivider} />
    </View>
  );
}

function InfoRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      {onPress ? (
        <TouchableOpacity onPress={onPress}>
          <Text style={[styles.infoValue, styles.link]}>{value}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.infoValue}>{value}</Text>
      )}
    </View>
  );
}

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <View style={[styles.chip, color ? { backgroundColor: color } : {}]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────

export default function ContactDetailScreen() {
  const navigation = useNavigation<ContactDetailNavProp>();
  const route = useRoute<ContactDetailRouteProp>();
  const { contactId } = route.params;

  const [contact, setContact] = useState<ContactDetail>(() =>
    getMockContactDetail(contactId)
  );
  const [editMode, setEditMode] = useState(false);
  const [draftNotes, setDraftNotes] = useState(contact.notes);
  const [draftPainPoint, setDraftPainPoint] = useState(contact.painPoint);
  const [cardModalVisible, setCardModalVisible] = useState(false);

  // Configure nav header edit button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "",
      headerBackTitle: "Contacts",
      headerRight: () => (
        editMode ? null : (
          <TouchableOpacity onPress={() => {
            setDraftNotes(contact.notes);
            setDraftPainPoint(contact.painPoint);
            setEditMode(true);
          }}>
            <Text style={styles.navBtn}>Edit</Text>
          </TouchableOpacity>
        )
      ),
    });
  }, [navigation, editMode, contact.notes, contact.painPoint]);

  async function handleSave() {
    try {
      // Against mock — updateContact will fail (no real server), so we update local state directly
      const updated: ContactDetail = {
        ...contact,
        notes: draftNotes,
        painPoint: draftPainPoint,
      };
      setContact(updated);
      setEditMode(false);
    } catch {
      // In a real app we'd handle the error; for now just exit edit mode
      setContact((prev) => ({ ...prev, notes: draftNotes, painPoint: draftPainPoint }));
      setEditMode(false);
    }
  }

  function handleCancel() {
    setDraftNotes(contact.notes);
    setDraftPainPoint(contact.painPoint);
    setEditMode(false);
  }

  const avatarBg = avatarColor(contact.leadTemperature);
  const barColor = completenessBarColor(contact.completenessScore);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Header section ─────────────────────────────────────────────── */}
        <View style={styles.headerSection}>
          {/* Large initials circle */}
          <View style={[styles.avatarLarge, { backgroundColor: avatarBg }]}>
            <Text style={styles.avatarLargeText}>
              {initials(contact.firstName, contact.lastName)}
            </Text>
          </View>

          {/* Name */}
          <Text style={styles.fullName}>{contact.firstName} {contact.lastName}</Text>

          {/* Job title + company */}
          {(contact.jobTitle || contact.company) ? (
            <Text style={styles.subtitle}>
              {[contact.jobTitle, contact.company].filter(Boolean).join(" · ")}
            </Text>
          ) : null}

          {/* Completeness score badge */}
          <View style={[styles.completenessContainer, { borderColor: barColor }]}>
            <Text style={[styles.completenessText, { color: barColor }]}>
              Profile {contact.completenessScore}% complete
            </Text>
          </View>

          {/* Action row */}
          <View style={styles.actionRow}>
            {contact.phones.length > 0 && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openUrl(`tel:${contact.phones[0]}`)}
              >
                <Text style={styles.actionIcon}>📞</Text>
                <Text style={styles.actionLabel}>Call</Text>
              </TouchableOpacity>
            )}
            {contact.emails.length > 0 && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openUrl(`mailto:${contact.emails[0]}`)}
              >
                <Text style={styles.actionIcon}>✉️</Text>
                <Text style={styles.actionLabel}>Email</Text>
              </TouchableOpacity>
            )}
            {contact.phones.length > 0 && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openUrl(`https://wa.me/${contact.phones[0].replace(/\D/g, "")}`)}
              >
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionLabel}>WhatsApp</Text>
              </TouchableOpacity>
            )}
            {contact.linkedin ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => contact.linkedin && openUrl(contact.linkedin)}
              >
                <Text style={styles.actionIcon}>🔗</Text>
                <Text style={styles.actionLabel}>LinkedIn</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* ── Contact Info ────────────────────────────────────────────────── */}
        <SectionHeader title="Contact Info" />
        <View style={styles.card}>
          {contact.phones.map((p, i) => (
            <InfoRow
              key={`phone-${i}`}
              label={i === 0 ? "Mobile" : "Office"}
              value={p}
              onPress={() => openUrl(`tel:${p}`)}
            />
          ))}

          {contact.emails.length > 0 ? (
            contact.emails.map((e, i) => (
              <InfoRow
                key={`email-${i}`}
                label={i === 0 ? "Email" : "Email 2"}
                value={e}
                onPress={() => openUrl(`mailto:${e}`)}
              />
            ))
          ) : (
            <View style={styles.amberBox}>
              <Text style={styles.amberText}>
                ⚠️ No email — this contact cannot receive campaigns
              </Text>
            </View>
          )}

          {contact.website ? (
            <InfoRow
              label="Website"
              value={contact.website}
              onPress={() => openUrl(contact.website)}
            />
          ) : null}

          {contact.address ? (
            <InfoRow label="Address" value={contact.address} />
          ) : null}

          {contact.linkedin ? (
            <InfoRow
              label="LinkedIn"
              value={contact.linkedin}
              onPress={() => openUrl(contact.linkedin)}
            />
          ) : null}

          {contact.facebook ? (
            <InfoRow
              label="Facebook"
              value={contact.facebook}
              onPress={() => openUrl(contact.facebook)}
            />
          ) : null}
        </View>

        {/* ── CRM Details ─────────────────────────────────────────────────── */}
        <SectionHeader title="CRM Details" />
        <View style={styles.card}>
          {/* Badges row */}
          <View style={styles.badgeRow}>
            {contact.source ? <Chip label={contact.source} color="#e3f2fd" /> : null}
            <Chip
              label={contact.status}
              color={contact.status === "Active" ? "#e8f5e9" : contact.status === "Lead" ? "#fff8e1" : "#fce4ec"}
            />
            <Chip label={tempLabel(contact.leadTemperature)} color="#f3e5f5" />
          </View>

          {/* Marketing consent */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Marketing Consent</Text>
            <View style={[styles.consentDot, { backgroundColor: consentColor(contact.marketingConsent) }]} />
            <Text style={[styles.infoValue, { color: consentColor(contact.marketingConsent) }]}>
              {contact.marketingConsent}
            </Text>
          </View>

          <InfoRow label="Decision Maker" value={contact.decisionMaker} />

          {/* Tags */}
          {contact.tags.length > 0 && (
            <View style={styles.chipsSection}>
              <Text style={styles.infoLabel}>Tags</Text>
              <View style={styles.chipsRow}>
                {contact.tags.map((t) => <Chip key={t} label={t} />)}
              </View>
            </View>
          )}

          {/* Interests */}
          {contact.interests.length > 0 && (
            <View style={styles.chipsSection}>
              <Text style={styles.infoLabel}>Interests</Text>
              <View style={styles.chipsRow}>
                {contact.interests.map((i) => <Chip key={i} label={i} color="#e8f5e9" />)}
              </View>
            </View>
          )}
        </View>

        {/* ── Notes & Pain Point ──────────────────────────────────────────── */}
        <SectionHeader title="Notes & Pain Point" />
        <View style={styles.card}>
          <Text style={styles.infoLabel}>Pain Point</Text>
          {editMode ? (
            <TextInput
              style={styles.textArea}
              value={draftPainPoint}
              onChangeText={setDraftPainPoint}
              multiline
              placeholder="Enter pain point…"
              placeholderTextColor="#9e9e9e"
            />
          ) : (
            <Text style={styles.painPointText}>{contact.painPoint || "—"}</Text>
          )}

          <View style={styles.noteSpacer} />

          <Text style={styles.infoLabel}>Notes</Text>
          {editMode ? (
            <TextInput
              style={styles.textArea}
              value={draftNotes}
              onChangeText={setDraftNotes}
              multiline
              placeholder="Enter notes…"
              placeholderTextColor="#9e9e9e"
            />
          ) : (
            <Text style={styles.notesText}>{contact.notes || "—"}</Text>
          )}

          {contact.followUpDate && (
            <View style={styles.followUpRow}>
              <Text style={styles.infoLabel}>Follow-up</Text>
              <Text style={styles.followUpDate}>📅 {formatDate(contact.followUpDate)}</Text>
            </View>
          )}

          {/* Edit mode action buttons */}
          {editMode && (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Scanned Card ────────────────────────────────────────────────── */}
        <SectionHeader title="Scanned Card" />
        <View style={styles.card}>
          {contact.cardImageUri ? (
            <TouchableOpacity onPress={() => setCardModalVisible(true)}>
              <Image
                source={{ uri: contact.cardImageUri }}
                style={styles.cardThumb}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ) : (
            <Text style={styles.noCardText}>No card image saved</Text>
          )}
        </View>

        {/* ── Activity Timeline ───────────────────────────────────────────── */}
        <SectionHeader title="Activity Timeline" />
        <View style={styles.card}>
          {contact.activities.length === 0 ? (
            <Text style={styles.emptyActivity}>No activity logged yet</Text>
          ) : (
            contact.activities.map((act, idx) => (
              <View key={act.id} style={[styles.activityItem, idx < contact.activities.length - 1 && styles.activityBorder]}>
                <Text style={styles.activityIcon}>{activityIcon(act.type)}</Text>
                <View style={styles.activityBody}>
                  <Text style={styles.activityContent}>{act.content}</Text>
                  <Text style={styles.activityDate}>{formatDate(act.createdAt)}</Text>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.logActivityBtn}
            onPress={() => Alert.alert("Coming Soon", "Activity logging will be available in a future release.")}
          >
            <Text style={styles.logActivityBtnText}>+ Log Activity</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── Card image full-screen modal ───────────────────────────────────── */}
      {contact.cardImageUri ? (
        <Modal visible={cardModalVisible} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setCardModalVisible(false)}
          >
            <Image
              source={{ uri: contact.cardImageUri }}
              style={styles.cardFull}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9f9fb",
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // Nav button
  navBtn: {
    color: "#0c4aad",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "OmnesSemiBold",
    marginRight: 4,
  },

  // Header section
  headerSection: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e0e0e0",
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarLargeText: {
    color: "#ffffff",
    fontWeight: "800",
    fontFamily: "OmnesBold",
    fontSize: 32,
    letterSpacing: 1,
  },
  fullName: {
    fontSize: 24,
    fontWeight: "800",
    fontFamily: "OmnesBold",
    color: "#0c4aad",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#757575",
    textAlign: "center",
    marginBottom: 10,
  },
  completenessContainer: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
  },
  completenessText: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "OmnesBold",
  },
  actionRow: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
  },
  actionBtn: {
    alignItems: "center",
    gap: 4,
  },
  actionIcon: {
    fontSize: 24,
  },
  actionLabel: {
    fontSize: 11,
    color: "#616161",
    fontWeight: "500",
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 6,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "OmnesBold",
    color: "#757575",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e0e0e0",
  },

  // Card
  card: {
    backgroundColor: "#ffffff",
    marginHorizontal: 12,
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },

  // Info rows
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#f0f0f0",
    gap: 8,
  },
  infoLabel: {
    width: 108,
    fontSize: 13,
    color: "#9e9e9e",
    fontWeight: "500",
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: "#0c4aad",
    fontWeight: "500",
  },
  link: {
    color: "#1565c0",
    textDecorationLine: "underline",
  },

  // Amber warning
  amberBox: {
    backgroundColor: "#fff8e1",
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#ffb300",
  },
  amberText: {
    color: "#e65100",
    fontSize: 13,
    fontWeight: "500",
  },

  // Badge row
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },

  // Consent
  consentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Chips
  chipsSection: {
    marginTop: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#eeeeee",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "OmnesSemiBold",
    color: "#424242",
  },

  // Notes & Pain Point
  painPointText: {
    fontSize: 14,
    color: "#616161",
    fontStyle: "italic",
    lineHeight: 20,
    marginTop: 4,
  },
  notesText: {
    fontSize: 14,
    color: "#0c4aad",
    lineHeight: 20,
    marginTop: 4,
  },
  noteSpacer: {
    height: 12,
  },
  textArea: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: "#0c4aad",
    minHeight: 72,
    marginTop: 4,
    textAlignVertical: "top",
  },
  followUpRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  followUpDate: {
    fontSize: 14,
    color: "#0c4aad",
    fontWeight: "600",
    fontFamily: "OmnesSemiBold",
  },

  // Edit actions
  editActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: "#0c4aad",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontFamily: "OmnesBold",
    fontSize: 15,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#eeeeee",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#424242",
    fontWeight: "700",
    fontFamily: "OmnesBold",
    fontSize: 15,
  },

  // Scanned card
  cardThumb: {
    width: 150,
    height: 95,
    borderRadius: 6,
  },
  noCardText: {
    fontSize: 13,
    color: "#9e9e9e",
    fontStyle: "italic",
  },

  // Activity
  emptyActivity: {
    fontSize: 13,
    color: "#9e9e9e",
    fontStyle: "italic",
    marginBottom: 10,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    gap: 10,
  },
  activityBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#f0f0f0",
  },
  activityIcon: {
    fontSize: 20,
    width: 28,
    textAlign: "center",
  },
  activityBody: {
    flex: 1,
  },
  activityContent: {
    fontSize: 14,
    color: "#0c4aad",
    lineHeight: 20,
  },
  activityDate: {
    fontSize: 12,
    color: "#9e9e9e",
    marginTop: 2,
  },
  logActivityBtn: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#0c4aad",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  logActivityBtnText: {
    color: "#0c4aad",
    fontWeight: "700",
    fontFamily: "OmnesBold",
    fontSize: 14,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardFull: {
    width: "90%",
    height: "60%",
  },

  bottomPad: {
    height: 20,
  },
});
