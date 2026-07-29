import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import {
  getDashboard,
  DashboardData,
  ContactListItem,
  DashboardReminder,
} from "../api/contacts";
import { getMe, logout } from "../api/auth";
import { Avatar, EmptyState, ErrorState, LoadingState, useToast } from "../components";
import { colors, radius, shadow, spacing, type } from "../theme";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** "Today" / "Tomorrow" / short date for a yyyy-mm-dd follow-up date. */
function formatFollowUp(dateStr: string): string {
  const due = new Date(dateStr);
  if (isNaN(due.getTime())) return dateStr;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(due) - startOfDay(new Date())) / 86400000
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatTileProps {
  value: string | number;
  label: string;
  color: string;
  hint?: string;
}

function StatTile({ value, label, color, hint }: StatTileProps) {
  return (
    <View
      style={[styles.statTile, { borderTopColor: color }]}
      accessibilityLabel={`${label}: ${value}${hint ? ` (${hint})` : ""}`}
    >
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

interface ContactRowProps {
  contact: ContactListItem;
  rightLabel: string;
  rightColor: string;
  accessibilityHint: string;
  onPress: () => void;
}

function ContactRow({
  contact,
  rightLabel,
  rightColor,
  accessibilityHint,
  onPress,
}: ContactRowProps) {
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  return (
    <TouchableOpacity
      style={styles.listRow}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${contact.company}. ${accessibilityHint}`}
    >
      <View style={styles.listRowLeft}>
        <Text style={styles.listRowName}>{name}</Text>
        <Text style={styles.listRowSub} numberOfLines={1}>
          {contact.company}
        </Text>
      </View>
      <Text style={[styles.listRowRight, { color: rightColor }]}>
        {rightLabel}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

export default function DashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [data, setData] = useState<DashboardData | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  // Guards against setState after unmount / overlapping loads.
  const loadSeq = useRef(0);
  // Ref mirror of "we have data" so the focus callback never sees a stale value.
  const hasData = useRef(false);

  const load = useCallback(
    async (mode: "initial" | "focus" | "refresh") => {
      const seq = ++loadSeq.current;
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      try {
        const [dashboard, me] = await Promise.all([getDashboard(), getMe()]);
        if (seq !== loadSeq.current) return;
        hasData.current = true;
        setData(dashboard);
        setUserName(me.user.name);
        setError(false);
      } catch {
        if (seq !== loadSeq.current) return;
        if (hasData.current) {
          // Keep showing stale data; just tell the user the refresh failed.
          toast.show("Couldn't refresh dashboard", "error");
        } else {
          setError(true);
        }
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [toast]
  );

  // Runs on mount AND on every focus — a single fetch path, no double-fetch.
  useFocusEffect(
    useCallback(() => {
      load(hasData.current ? "focus" : "initial");
    }, [load])
  );

  function handleLogout() {
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  }

  function openContact(contactId: string) {
    navigation.navigate("ContactDetail", { contactId });
  }

  const header = (
    <View style={[styles.header, { marginTop: insets.top }]}>
      <View style={styles.headerLeft}>
        <Text style={styles.greeting}>
          {getGreeting()}
          {userName ? `, ${userName.split(" ")[0]}` : ""}
        </Text>
        <Text style={styles.dateText}>{formatDate(new Date())}</Text>
      </View>
      <TouchableOpacity
        onPress={handleLogout}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !data) {
    return (
      <View style={styles.screen}>
        {header}
        <LoadingState label="Loading dashboard…" />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.screen}>
        {header}
        <ErrorState
          title="Couldn't load your dashboard"
          onRetry={() => load("initial")}
        />
      </View>
    );
  }

  if (!data) return null;

  const reminders = data.upcomingReminders ?? [];
  const inactive = data.inactive30D ?? [];
  const recent = data.recent ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load("refresh")}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      {header}

      {data.totalContacts === 0 ? (
        // -----------------------------------------------------------------
        // First-run: no contacts yet — nudge toward the first scan.
        // -----------------------------------------------------------------
        <EmptyState
          icon="camera-outline"
          title="No contacts yet"
          message="Scan your first business card and it will show up here."
          actionLabel="Scan a Business Card"
          onAction={() => navigation.navigate("CameraPermission")}
        />
      ) : (
        <>
          {/* ---------------------------------------------------------------- */}
          {/* Stats row (2x2 grid)                                              */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.statsGrid}>
            <StatTile
              value={data.totalContacts}
              label="Total Contacts"
              color={colors.primary}
            />
            <StatTile
              value={reminders.length}
              label="Follow-ups Due"
              color={colors.warmDark}
            />
            <StatTile
              value={data.activeDealsCount}
              label="Active Deals"
              color={colors.success}
              hint="Phase 2"
            />
            <StatTile
              value={data.pipelineValue.toLocaleString("en-GB")}
              label="Pipeline Value"
              color={colors.coldDark}
              hint="Phase 2"
            />
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* Scan CTA — compact strip                                          */}
          {/* ---------------------------------------------------------------- */}
          <TouchableOpacity
            style={styles.scanStrip}
            onPress={() => navigation.navigate("CameraPermission")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Scan a business card"
          >
            <Ionicons
              name="camera-outline"
              size={20}
              color={colors.white}
              style={styles.scanStripIcon}
            />
            <Text style={styles.scanStripText}>Scan a Business Card</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primaryLight} />
          </TouchableOpacity>

          {/* ---------------------------------------------------------------- */}
          {/* Recently Added                                                    */}
          {/* ---------------------------------------------------------------- */}
          {recent.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recently Added</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate("Contacts")}
                  accessibilityRole="button"
                  accessibilityLabel="View all contacts"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.viewAll}>View All</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
              >
                {recent.map((contact) => {
                  const name =
                    `${contact.firstName} ${contact.lastName}`.trim();
                  return (
                    <TouchableOpacity
                      key={contact.id}
                      style={styles.contactCard}
                      onPress={() => openContact(contact.id)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Open contact ${name}, ${contact.company}`}
                    >
                      <Avatar name={name} size="md" style={styles.cardAvatar} />
                      <Text style={styles.contactName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.contactCompany} numberOfLines={1}>
                        {contact.company}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Upcoming follow-ups                                               */}
          {/* ---------------------------------------------------------------- */}
          {reminders.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Upcoming Follow-ups</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{reminders.length}</Text>
                </View>
              </View>

              {reminders.map((reminder: DashboardReminder) => (
                <ContactRow
                  key={reminder.contact.id}
                  contact={reminder.contact}
                  rightLabel={formatFollowUp(reminder.followUpDate)}
                  rightColor={colors.warmDark}
                  accessibilityHint={`Follow up ${formatFollowUp(
                    reminder.followUpDate
                  )}`}
                  onPress={() => openContact(reminder.contact.id)}
                />
              ))}
            </View>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Needs attention (no activity in 30+ days)                         */}
          {/* ---------------------------------------------------------------- */}
          {inactive.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Needs Attention</Text>
              </View>
              <Text style={styles.sectionCaption}>
                No activity in the last 30 days
              </Text>

              {inactive.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  rightLabel="30d+ quiet"
                  rightColor={colors.textMuted}
                  accessibilityHint="No activity in over 30 days"
                  onPress={() => openContact(contact.id)}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl + spacing.sm,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: colors.primary,
    // marginTop is applied dynamically via useSafeAreaInsets() -- margin
    // (not padding) leaves an actual gap above the header's blue
    // background, so the status bar area shows the screen's own neutral
    // background behind it instead of blue, and its default (unmodified)
    // icon color stays visible without needing a per-screen override.
    paddingTop: spacing.lg + spacing.xs,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg + spacing.xs,
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  greeting: {
    fontSize: type.size.h2,
    fontWeight: "700",
    fontFamily: type.family.bold,
    color: colors.white,
    marginBottom: spacing.xs,
  },
  dateText: {
    fontSize: type.size.caption,
    color: colors.primaryLight,
  },
  logoutText: {
    fontSize: type.size.tiny + 1,
    color: colors.primaryLight,
  },

  // Stats grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: spacing.md,
    gap: spacing.md,
  },
  statTile: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderTopWidth: 4,
    ...shadow.card,
  },
  statValue: {
    fontSize: type.size.h1,
    fontWeight: "800",
    fontFamily: type.family.bold,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: type.size.tiny + 1,
    color: colors.textSecondary,
    fontWeight: "500",
    fontFamily: type.family.medium,
  },
  statHint: {
    fontSize: type.size.tiny - 1,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Sections
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg + spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: type.size.h3 - 1,
    fontWeight: "700",
    fontFamily: type.family.bold,
    color: colors.primary,
  },
  sectionCaption: {
    fontSize: type.size.tiny + 1,
    color: colors.textMuted,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  viewAll: {
    fontSize: type.size.caption,
    color: colors.primary,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
  },
  countBadge: {
    backgroundColor: colors.warning,
    borderRadius: radius.full,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xs + 2,
  },
  countBadgeText: {
    color: colors.white,
    fontSize: type.size.tiny,
    fontWeight: "700",
    fontFamily: type.family.bold,
  },

  // Horizontal contact cards
  horizontalScroll: {
    gap: spacing.md,
    paddingRight: spacing.xs,
  },
  contactCard: {
    width: 100,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  cardAvatar: {
    marginBottom: spacing.sm,
  },
  contactName: {
    fontSize: type.size.tiny + 1,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
    color: colors.primary,
    textAlign: "center",
    marginBottom: 2,
  },
  contactCompany: {
    fontSize: type.size.tiny - 1,
    color: colors.textSecondary,
    textAlign: "center",
  },

  // List rows (reminders + inactive)
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md + 2,
    padding: spacing.md + 2,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  listRowLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  listRowName: {
    fontSize: type.size.caption + 1,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
    color: colors.primary,
    marginBottom: 2,
  },
  listRowSub: {
    fontSize: type.size.tiny + 1,
    color: colors.textSecondary,
  },
  listRowRight: {
    fontSize: type.size.tiny + 1,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
  },

  // Scan CTA — compact strip
  scanStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md + 2,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
  },
  scanStripIcon: {
    marginRight: spacing.sm,
  },
  scanStripText: {
    flex: 1,
    fontSize: type.size.caption + 1,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
    color: colors.white,
  },
});
