import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Modal,
  Image,
  Alert,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { RootStackParamList } from "../navigation/types";
import {
  Activity,
  ContactDetail,
  deleteContact,
  getContact,
  logActivity,
  toggleFavorite,
  updateContact,
} from "../api/contacts";
import {
  AppButton,
  AppTextInput,
  Avatar,
  Badge,
  BadgeVariant,
  ConfirmSheet,
  ErrorState,
  LoadingState,
  useToast,
} from "../components";
import {
  colors,
  completenessColor,
  radius,
  shadow,
  spacing,
  temperatureColor,
  type,
} from "../theme";

type ContactDetailNavProp = NativeStackNavigationProp<RootStackParamList, "ContactDetail">;
type ContactDetailRouteProp = RouteProp<RootStackParamList, "ContactDetail">;

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * The API returns the full detail including optimistic-concurrency `revision`
 * and the `favorite` flag; the shared type doesn't declare them yet.
 */
type Detail = ContactDetail & { revision?: number; favorite?: boolean };

// ─── Helpers ───────────────────────────────────────────────────────────────

const FOLLOW_UP_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidFollowUpDate(value: string): boolean {
  if (!FOLLOW_UP_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
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

const ACTIVITY_ICON: Record<Activity["type"], IoniconName> = {
  call: "call-outline",
  email: "mail-outline",
  meeting: "people-outline",
  note: "document-text-outline",
};

const ACTIVITY_TYPES: Activity["type"][] = ["note", "call", "email", "meeting"];

function statusVariant(status: ContactDetail["status"]): BadgeVariant {
  switch (status) {
    case "Active":
      return "success";
    case "Lead":
      return "warning";
    default:
      return "error";
  }
}

function temperatureVariant(t?: ContactDetail["leadTemperature"]): BadgeVariant {
  switch (t) {
    case "Hot":
      return "hot";
    case "Warm":
      return "warm";
    case "Cold":
      return "cold";
    default:
      return "default";
  }
}

function consentColor(consent: ContactDetail["marketingConsent"]): string {
  switch (consent) {
    case "Yes":
      return colors.success;
    case "No":
      return colors.hot;
    default:
      return colors.textMuted;
  }
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Cannot open link", url));
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
        <TouchableOpacity
          onPress={onPress}
          accessibilityRole="link"
          accessibilityLabel={`${label}: ${value}`}
        >
          <Text style={[styles.infoValue, styles.link]}>{value}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.infoValue}>{value}</Text>
      )}
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.actionBtn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.actionIconCircle}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────

export default function ContactDetailScreen() {
  const navigation = useNavigation<ContactDetailNavProp>();
  const route = useRoute<ContactDetailRouteProp>();
  const { contactId } = route.params;
  const toast = useToast();

  const [contact, setContact] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftPainPoint, setDraftPainPoint] = useState("");
  const [draftFollowUp, setDraftFollowUp] = useState("");
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activityType, setActivityType] = useState<Activity["type"]>("note");
  const [activityText, setActivityText] = useState("");
  const [loggingActivity, setLoggingActivity] = useState(false);

  const hasLoadedRef = useRef(false);

  const fetchContact = useCallback(async (): Promise<Detail | null> => {
    try {
      const data = (await getContact(contactId)) as Detail;
      setContact(data);
      setLoadError(false);
      hasLoadedRef.current = true;
      return data;
    } catch {
      if (!hasLoadedRef.current) setLoadError(true);
      return null;
    }
  }, [contactId]);

  // Fetch on focus. useFocusEffect also fires on mount, so this is the single
  // fetch path — no separate mount effect, hence no double-fetch.
  useFocusEffect(
    useCallback(() => {
      fetchContact();
    }, [fetchContact])
  );

  function enterEditMode(c: Detail) {
    setDraftNotes(c.notes ?? "");
    setDraftPainPoint(c.painPoint ?? "");
    setDraftFollowUp(c.followUpDate ?? "");
    setEditMode(true);
  }

  async function handleToggleFavorite() {
    if (!contact) return;
    const previous = contact.favorite ?? false;
    setContact((prev) => (prev ? { ...prev, favorite: !previous } : prev));
    try {
      const { favorite } = await toggleFavorite(contactId);
      setContact((prev) => (prev ? { ...prev, favorite } : prev));
    } catch {
      setContact((prev) => (prev ? { ...prev, favorite: previous } : prev));
      toast.show("Could not update favorite", "error");
    }
  }

  // Configure nav header: favorite star, edit, delete.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "",
      headerBackTitle: "Contacts",
      headerRight: () =>
        contact && !editMode ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              accessibilityRole="button"
              accessibilityLabel={
                contact.favorite ? "Remove from favorites" : "Add to favorites"
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={contact.favorite ? "star" : "star-outline"}
                size={24}
                color={contact.favorite ? colors.warning : colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => enterEditMode(contact)}
              accessibilityRole="button"
              accessibilityLabel="Edit contact"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="create-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmDeleteVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Delete contact"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={24} color={colors.error} />
            </TouchableOpacity>
          </View>
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, editMode, contact]);

  async function handleSave() {
    if (!contact || saving) return;

    const trimmedFollowUp = draftFollowUp.trim();
    if (trimmedFollowUp && !isValidFollowUpDate(trimmedFollowUp)) {
      toast.show("Follow-up date must be YYYY-MM-DD", "error");
      return;
    }

    // Only send fields that actually changed, plus the current revision so
    // the server can detect stale writes (409).
    const patch: Record<string, unknown> = {};
    if (draftNotes !== (contact.notes ?? "")) patch.notes = draftNotes;
    if (draftPainPoint !== (contact.painPoint ?? "")) patch.painPoint = draftPainPoint;
    if (trimmedFollowUp !== (contact.followUpDate ?? "")) {
      patch.followUpDate = trimmedFollowUp || null;
    }

    if (Object.keys(patch).length === 0) {
      setEditMode(false);
      return;
    }
    patch.revision = contact.revision;

    setSaving(true);
    try {
      const updated = (await updateContact(contactId, patch as Partial<ContactDetail>)) as Detail;
      setContact(updated);
      setEditMode(false);
      toast.show("Contact saved", "success");
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        toast.show("Contact changed elsewhere — reloaded", "error");
        setEditMode(false);
        fetchContact();
      } else {
        toast.show("Could not save contact", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (!contact) return;
    const hasChanges =
      draftNotes !== (contact.notes ?? "") ||
      draftPainPoint !== (contact.painPoint ?? "") ||
      draftFollowUp.trim() !== (contact.followUpDate ?? "");
    if (hasChanges) {
      Alert.alert("Discard Changes?", "Your edits will not be saved.", [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => setEditMode(false),
        },
      ]);
    } else {
      setEditMode(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteContact(contactId);
      setConfirmDeleteVisible(false);
      toast.show("Contact deleted", "success");
      navigation.goBack();
    } catch {
      toast.show("Could not delete contact", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleLogActivity() {
    const content = activityText.trim();
    if (!content) {
      toast.show("Enter some activity details first", "error");
      return;
    }
    setLoggingActivity(true);
    try {
      await logActivity(contactId, activityType, content);
      // Refresh so the timeline and lastActivityDate reflect the server state.
      await fetchContact();
      setActivityText("");
      setComposerOpen(false);
      toast.show("Activity logged", "success");
    } catch {
      toast.show("Could not log activity", "error");
    } finally {
      setLoggingActivity(false);
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────
  if (!contact) {
    return (
      <SafeAreaView style={styles.container}>
        {loadError ? (
          <ErrorState
            title="Could not load contact"
            onRetry={() => {
              setLoadError(false);
              fetchContact();
            }}
          />
        ) : (
          <LoadingState label="Loading contact…" />
        )}
      </SafeAreaView>
    );
  }

  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  const barColor = completenessColor(contact.completenessScore);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header section ─────────────────────────────────────────────── */}
        <View style={styles.headerSection}>
          <Avatar
            name={fullName}
            size="lg"
            color={temperatureColor(contact.leadTemperature)}
            style={styles.avatar}
          />

          <Text style={styles.fullName}>{fullName}</Text>

          {(contact.jobTitle || contact.company) ? (
            <Text style={styles.subtitle}>
              {[contact.jobTitle, contact.company].filter(Boolean).join(" · ")}
            </Text>
          ) : null}

          <View style={[styles.completenessContainer, { borderColor: barColor }]}>
            <Text style={[styles.completenessText, { color: barColor }]}>
              Profile {contact.completenessScore}% complete
            </Text>
          </View>

          {/* Quick actions */}
          <View style={styles.actionRow}>
            {contact.phones.length > 0 && (
              <QuickAction
                icon="call-outline"
                label="Call"
                onPress={() => openUrl(`tel:${contact.phones[0]}`)}
              />
            )}
            {contact.emails.length > 0 && (
              <QuickAction
                icon="mail-outline"
                label="Email"
                onPress={() => openUrl(`mailto:${contact.emails[0]}`)}
              />
            )}
            {contact.phones.length > 0 && (
              <QuickAction
                icon="chatbubble-outline"
                label="SMS"
                onPress={() => openUrl(`sms:${contact.phones[0]}`)}
              />
            )}
            {contact.phones.length > 0 && (
              <QuickAction
                icon="logo-whatsapp"
                label="WhatsApp"
                onPress={() =>
                  openUrl(`https://wa.me/${contact.phones[0].replace(/\D/g, "")}`)
                }
              />
            )}
            {contact.linkedin ? (
              <QuickAction
                icon="logo-linkedin"
                label="LinkedIn"
                onPress={() => openUrl(contact.linkedin)}
              />
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
              <Ionicons name="warning-outline" size={16} color={colors.warmDark} />
              <Text style={styles.amberText}>
                No email — this contact cannot receive campaigns
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

          {contact.address ? <InfoRow label="Address" value={contact.address} /> : null}

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
          <View style={styles.badgeRow}>
            {contact.source ? <Badge label={contact.source} variant="primary" /> : null}
            <Badge label={contact.status} variant={statusVariant(contact.status)} />
            {contact.leadTemperature ? (
              <Badge
                label={contact.leadTemperature}
                variant={temperatureVariant(contact.leadTemperature)}
              />
            ) : null}
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Marketing Consent</Text>
            <View
              style={[
                styles.consentDot,
                { backgroundColor: consentColor(contact.marketingConsent) },
              ]}
            />
            <Text style={[styles.infoValue, { color: consentColor(contact.marketingConsent) }]}>
              {contact.marketingConsent}
            </Text>
          </View>

          <InfoRow label="Decision Maker" value={contact.decisionMaker} />

          {contact.tags.length > 0 && (
            <View style={styles.chipsSection}>
              <Text style={styles.infoLabel}>Tags</Text>
              <View style={styles.chipsRow}>
                {contact.tags.map((t) => (
                  <Badge key={t} label={t} />
                ))}
              </View>
            </View>
          )}

          {contact.interests.length > 0 && (
            <View style={styles.chipsSection}>
              <Text style={styles.infoLabel}>Interests</Text>
              <View style={styles.chipsRow}>
                {contact.interests.map((i) => (
                  <Badge key={i} label={i} variant="success" />
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── Notes & Pain Point ──────────────────────────────────────────── */}
        <SectionHeader title="Notes & Pain Point" />
        <View style={styles.card}>
          {editMode ? (
            <>
              <AppTextInput
                label="Pain Point"
                value={draftPainPoint}
                onChangeText={setDraftPainPoint}
                multiline
                placeholder="Enter pain point…"
                style={styles.textArea}
                accessibilityLabel="Pain point"
              />
              <AppTextInput
                label="Notes"
                value={draftNotes}
                onChangeText={setDraftNotes}
                multiline
                placeholder="Enter notes…"
                style={styles.textArea}
                accessibilityLabel="Notes"
              />
              <AppTextInput
                label="Follow-up date (YYYY-MM-DD)"
                value={draftFollowUp}
                onChangeText={setDraftFollowUp}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Follow-up date"
              />
              <View style={styles.editActions}>
                <AppButton
                  title="Save"
                  onPress={handleSave}
                  loading={saving}
                  style={styles.editActionBtn}
                  accessibilityLabel="Save contact changes"
                />
                <AppButton
                  title="Cancel"
                  onPress={handleCancel}
                  variant="secondary"
                  disabled={saving}
                  style={styles.editActionBtn}
                  accessibilityLabel="Cancel editing"
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.infoLabel}>Pain Point</Text>
              <Text style={styles.painPointText}>{contact.painPoint || "—"}</Text>

              <View style={styles.noteSpacer} />

              <Text style={styles.infoLabel}>Notes</Text>
              <Text style={styles.notesText}>{contact.notes || "—"}</Text>

              {contact.followUpDate ? (
                <View style={styles.followUpRow}>
                  <Text style={styles.infoLabel}>Follow-up</Text>
                  <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                  <Text style={styles.followUpDate}>{formatDate(contact.followUpDate)}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* ── Scanned Card ────────────────────────────────────────────────── */}
        <SectionHeader title="Scanned Card" />
        <View style={styles.card}>
          {contact.cardImageUri ? (
            <TouchableOpacity
              onPress={() => setCardModalVisible(true)}
              accessibilityRole="imagebutton"
              accessibilityLabel="View scanned card full screen"
            >
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
              <View
                key={act.id}
                style={[
                  styles.activityItem,
                  idx < contact.activities.length - 1 && styles.activityBorder,
                ]}
              >
                <View style={styles.activityIconWrap}>
                  <Ionicons name={ACTIVITY_ICON[act.type]} size={18} color={colors.primary} />
                </View>
                <View style={styles.activityBody}>
                  <Text style={styles.activityContent}>{act.content}</Text>
                  <Text style={styles.activityDate}>{formatDate(act.createdAt)}</Text>
                </View>
              </View>
            ))
          )}

          {composerOpen ? (
            <View style={styles.composer}>
              <View style={styles.typeChipsRow}>
                {ACTIVITY_TYPES.map((t) => {
                  const selected = activityType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, selected && styles.typeChipSelected]}
                      onPress={() => setActivityType(t)}
                      accessibilityRole="button"
                      accessibilityLabel={`Activity type ${t}`}
                      accessibilityState={{ selected }}
                    >
                      <Ionicons
                        name={ACTIVITY_ICON[t]}
                        size={14}
                        color={selected ? colors.white : colors.primary}
                      />
                      <Text
                        style={[styles.typeChipText, selected && styles.typeChipTextSelected]}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <AppTextInput
                value={activityText}
                onChangeText={setActivityText}
                multiline
                placeholder="What happened?"
                style={styles.textArea}
                accessibilityLabel="Activity details"
              />
              <View style={styles.editActions}>
                <AppButton
                  title="Save Activity"
                  onPress={handleLogActivity}
                  loading={loggingActivity}
                  style={styles.editActionBtn}
                  accessibilityLabel="Save activity"
                />
                <AppButton
                  title="Cancel"
                  onPress={() => {
                    setComposerOpen(false);
                    setActivityText("");
                  }}
                  variant="secondary"
                  disabled={loggingActivity}
                  style={styles.editActionBtn}
                  accessibilityLabel="Cancel logging activity"
                />
              </View>
            </View>
          ) : (
            <AppButton
              title="Log Activity"
              icon="add"
              variant="secondary"
              onPress={() => setComposerOpen(true)}
              style={styles.logActivityBtn}
              accessibilityLabel="Log a new activity"
            />
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── Card image full-screen modal ─────────────────────────────────── */}
      {contact.cardImageUri ? (
        <Modal
          visible={cardModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCardModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setCardModalVisible(false)}
            accessibilityLabel="Close card image"
          >
            <Image
              source={{ uri: contact.cardImageUri }}
              style={styles.cardFull}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </Modal>
      ) : null}

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      <ConfirmSheet
        visible={confirmDeleteVisible}
        title="Delete contact?"
        message={`${fullName} and all their activity will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // Nav header actions
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },

  // Header section
  headerSection: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatar: {
    marginBottom: spacing.md,
  },
  fullName: {
    fontSize: type.size.h2 + 2,
    fontWeight: "800",
    fontFamily: type.family.bold,
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: type.size.caption + 1,
    color: colors.neutral,
    textAlign: "center",
    marginBottom: spacing.sm + 2,
  },
  completenessContainer: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: spacing.xs,
    marginBottom: spacing.lg,
  },
  completenessText: {
    fontSize: type.size.caption,
    fontWeight: "700",
    fontFamily: type.family.bold,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "center",
  },
  actionBtn: {
    alignItems: "center",
    gap: spacing.xs,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: type.size.tiny,
    color: colors.textSecondary,
    fontWeight: "500",
    fontFamily: type.family.medium,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: 6,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: type.size.caption,
    fontWeight: "700",
    fontFamily: type.family.bold,
    color: colors.neutral,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    padding: 14,
    ...shadow.card,
  },

  // Info rows
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  infoLabel: {
    width: 108,
    fontSize: type.size.caption,
    color: colors.textMuted,
    fontWeight: "500",
    fontFamily: type.family.medium,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: type.size.caption + 1,
    color: colors.primary,
    fontWeight: "500",
    fontFamily: type.family.medium,
  },
  link: {
    color: colors.coldDark,
    textDecorationLine: "underline",
  },

  // Amber warning
  amberBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: 10,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  amberText: {
    flex: 1,
    color: colors.warmDark,
    fontSize: type.size.caption,
    fontWeight: "500",
    fontFamily: type.family.medium,
  },

  // Badge row
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },

  // Consent
  consentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Chips
  chipsSection: {
    marginTop: spacing.sm,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },

  // Notes & Pain Point
  painPointText: {
    fontSize: type.size.caption + 1,
    color: colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  notesText: {
    fontSize: type.size.caption + 1,
    color: colors.primary,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  noteSpacer: {
    height: spacing.md,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  followUpRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: spacing.sm,
  },
  followUpDate: {
    fontSize: type.size.caption + 1,
    color: colors.primary,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
  },

  // Edit / composer actions
  editActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: spacing.xs,
  },
  editActionBtn: {
    flex: 1,
  },

  // Scanned card
  cardThumb: {
    width: 150,
    height: 95,
    borderRadius: radius.sm,
  },
  noCardText: {
    fontSize: type.size.caption,
    color: colors.textMuted,
    fontStyle: "italic",
  },

  // Activity
  emptyActivity: {
    fontSize: type.size.caption,
    color: colors.textMuted,
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
    borderColor: colors.borderLight,
  },
  activityIconWrap: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  activityBody: {
    flex: 1,
  },
  activityContent: {
    fontSize: type.size.caption + 1,
    color: colors.primary,
    lineHeight: 20,
  },
  activityDate: {
    fontSize: type.size.tiny + 1,
    color: colors.textMuted,
    marginTop: 2,
  },
  logActivityBtn: {
    marginTop: spacing.md,
  },

  // Composer
  composer: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    paddingTop: spacing.md,
  },
  typeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    backgroundColor: colors.surface,
  },
  typeChipSelected: {
    backgroundColor: colors.primary,
  },
  typeChipText: {
    fontSize: type.size.tiny + 1,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
    color: colors.primary,
  },
  typeChipTextSelected: {
    color: colors.white,
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
