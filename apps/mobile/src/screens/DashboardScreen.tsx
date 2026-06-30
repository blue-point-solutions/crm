import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { ContactListItem } from "../api/contacts";
import { logout } from "../api/auth";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const TODAY = "2026-06-30";

const MOCK_RECENT: ContactListItem[] = [
  {
    id: "1",
    firstName: "Sarah",
    lastName: "Mitchell",
    company: "Apex Solutions Ltd",
    email: "s.mitchell@apexsolutions.co.uk",
    phone: "+44 7700 900123",
    leadTemperature: "Hot",
    source: "BNI",
    completenessScore: 92,
    dateAdded: "2026-06-28T09:14:00Z",
  },
  {
    id: "2",
    firstName: "James",
    lastName: "O'Brien",
    company: "Pinnacle Consulting",
    email: "jobrien@pinnacleconsult.com",
    phone: "+44 7700 900456",
    leadTemperature: "Warm",
    source: "TradeShow",
    completenessScore: 74,
    dateAdded: "2026-06-27T14:32:00Z",
  },
  {
    id: "3",
    firstName: "Priya",
    lastName: "Sharma",
    company: "NovaTech Industries",
    email: "priya.sharma@novatech.io",
    leadTemperature: "Hot",
    source: "Referral",
    completenessScore: 85,
    dateAdded: "2026-06-26T11:05:00Z",
  },
  {
    id: "4",
    firstName: "Marcus",
    lastName: "Webb",
    company: "Greenfield Partners",
    phone: "+44 7911 123456",
    leadTemperature: "Cold",
    source: "WalkIn",
    completenessScore: 41,
    dateAdded: "2026-06-25T16:48:00Z",
  },
  {
    id: "5",
    firstName: "Fiona",
    lastName: "Gallagher",
    company: "Horizon Digital",
    email: "fiona@horizondigital.net",
    phone: "+44 7800 654321",
    leadTemperature: "Warm",
    source: "Online",
    completenessScore: 61,
    dateAdded: "2026-06-24T10:22:00Z",
  },
];

interface ReminderContact extends ContactListItem {
  followUpDate: string;
}

const MOCK_REMINDERS: ReminderContact[] = [
  {
    id: "6",
    firstName: "Daniel",
    lastName: "Okonkwo",
    company: "Sterling Capital Group",
    email: "d.okonkwo@sterlingcg.com",
    phone: "+44 7500 111222",
    source: "ColdOutreach",
    completenessScore: 55,
    dateAdded: "2026-06-01T08:00:00Z",
    followUpDate: TODAY,
  },
  {
    id: "7",
    firstName: "Aisha",
    lastName: "Patel",
    company: "BlueSky Ventures",
    email: "aisha@bluesky.io",
    leadTemperature: "Hot",
    source: "BNI",
    completenessScore: 78,
    dateAdded: "2026-06-10T10:00:00Z",
    followUpDate: TODAY,
  },
  {
    id: "8",
    firstName: "Connor",
    lastName: "Hughes",
    company: "Meridian Tech",
    email: "c.hughes@meridian.tech",
    leadTemperature: "Warm",
    source: "Referral",
    completenessScore: 66,
    dateAdded: "2026-06-12T09:00:00Z",
    followUpDate: TODAY,
  },
];

interface InactiveContact extends ContactListItem {
  daysSinceActivity: number;
}

const MOCK_INACTIVE: InactiveContact[] = [
  {
    id: "9",
    firstName: "Rachel",
    lastName: "Tomkins",
    company: "Vantage Corp",
    email: "rtomkins@vantagecorp.com",
    leadTemperature: "Cold",
    source: "TradeShow",
    completenessScore: 35,
    dateAdded: "2026-04-15T10:00:00Z",
    daysSinceActivity: 45,
  },
  {
    id: "10",
    firstName: "Tom",
    lastName: "Baxter",
    company: "Ironclad Solutions",
    email: "tom@ironclad.io",
    leadTemperature: "Warm",
    source: "Online",
    completenessScore: 50,
    dateAdded: "2026-04-20T10:00:00Z",
    daysSinceActivity: 38,
  },
];

const MOCK_DASHBOARD = {
  total_contacts: 47,
  hot_leads: 8,
  follow_ups_today: 3,
  added_this_week: 5,
  recent: MOCK_RECENT,
  upcoming_reminders: MOCK_REMINDERS,
  inactive_30d: MOCK_INACTIVE,
};

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

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatTileProps {
  value: number;
  label: string;
  color: string;
  emoji?: string;
}

function StatTile({ value, label, color, emoji }: StatTileProps) {
  return (
    <View style={[styles.statTile, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>
        {value}
        {emoji ? ` ${emoji}` : ""}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface AvatarProps {
  firstName: string;
  lastName: string;
}

function Avatar({ firstName, lastName }: AvatarProps) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{getInitials(firstName, lastName)}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

export default function DashboardScreen({ navigation }: Props) {
  const data = MOCK_DASHBOARD;
  const userName = "Alex"; // placeholder — real app would come from auth context

  function handleLogout() {
    logout();
    navigation.replace("Login");
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>
            {getGreeting()}, {userName}
          </Text>
          <Text style={styles.dateText}>{formatDate(new Date())}</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Bell icon placeholder */}
          <TouchableOpacity style={styles.bellButton}>
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Stats row (2x2 grid)                                                */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.statsGrid}>
        <StatTile
          value={data.total_contacts}
          label="Total Contacts"
          color="#0c4aad"
        />
        <StatTile
          value={data.hot_leads}
          label="Hot Leads"
          color="#dc2626"
          emoji="🔥"
        />
        <StatTile
          value={data.follow_ups_today}
          label="Follow-ups Today"
          color="#ea580c"
        />
        <StatTile
          value={data.added_this_week}
          label="Added This Week"
          color="#16a34a"
        />
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Recent Contacts                                                      */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recently Added</Text>
          <TouchableOpacity onPress={() => navigation.navigate("Contacts")}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {data.recent.map((contact) => (
            <TouchableOpacity
              key={contact.id}
              style={styles.contactCard}
              onPress={() =>
                navigation.navigate("ContactDetail", {
                  contactId: contact.id,
                })
              }
            >
              <Avatar
                firstName={contact.firstName}
                lastName={contact.lastName}
              />
              <Text style={styles.contactName} numberOfLines={1}>
                {contact.firstName} {contact.lastName}
              </Text>
              <Text style={styles.contactCompany} numberOfLines={1}>
                {contact.company}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Follow-up Reminders                                                  */}
      {/* ------------------------------------------------------------------ */}
      {data.upcoming_reminders.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Follow-ups Due</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {data.upcoming_reminders.length}
              </Text>
            </View>
          </View>

          {data.upcoming_reminders.map((contact) => (
            <TouchableOpacity
              key={contact.id}
              style={styles.listRow}
              onPress={() =>
                navigation.navigate("ContactDetail", {
                  contactId: contact.id,
                })
              }
            >
              <View style={styles.listRowLeft}>
                <Text style={styles.listRowName}>
                  {contact.firstName} {contact.lastName}
                </Text>
                <Text style={styles.listRowSub}>{contact.company}</Text>
              </View>
              <Text style={styles.followUpLabel}>Follow up today</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Inactive Contacts                                                    */}
      {/* ------------------------------------------------------------------ */}
      {data.inactive_30d.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Needs Attention</Text>
          </View>

          {data.inactive_30d.map((contact) => (
            <TouchableOpacity
              key={contact.id}
              style={styles.listRow}
              onPress={() =>
                navigation.navigate("ContactDetail", {
                  contactId: contact.id,
                })
              }
            >
              <View style={styles.listRowLeft}>
                <Text style={styles.listRowName}>
                  {contact.firstName} {contact.lastName}
                </Text>
                <Text style={styles.listRowSub}>{contact.company}</Text>
              </View>
              <Text style={styles.inactiveLabel}>
                {contact.daysSinceActivity}d ago
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Scan CTA                                                             */}
      {/* ------------------------------------------------------------------ */}
      <TouchableOpacity
        style={styles.scanCard}
        onPress={() => navigation.navigate("CameraPermission")}
      >
        <Text style={styles.scanIcon}>📷</Text>
        <View style={styles.scanTextBlock}>
          <Text style={styles.scanTitle}>Scan a Business Card</Text>
          <Text style={styles.scanSubtitle}>
            Add a new contact instantly by scanning their card
          </Text>
        </View>
        <Text style={styles.scanArrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f6fa",
  },
  content: {
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#0c4aad",
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  dateText: {
    fontSize: 13,
    color: "#a0a8c0",
  },
  bellButton: {
    padding: 4,
  },
  bellIcon: {
    fontSize: 22,
  },
  logoutText: {
    fontSize: 12,
    color: "#a0a8c0",
  },

  // Stats grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 12,
  },
  statTile: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderTopWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },

  // Sections
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0c4aad",
  },
  viewAll: {
    fontSize: 13,
    color: "#0c4aad",
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  // Horizontal contact cards
  horizontalScroll: {
    gap: 12,
    paddingRight: 4,
  },
  contactCard: {
    width: 100,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0c4aad",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  contactName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0c4aad",
    textAlign: "center",
    marginBottom: 2,
  },
  contactCompany: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "center",
  },

  // List rows (reminders + inactive)
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  listRowLeft: {
    flex: 1,
    marginRight: 8,
  },
  listRowName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0c4aad",
    marginBottom: 2,
  },
  listRowSub: {
    fontSize: 12,
    color: "#6b7280",
  },
  followUpLabel: {
    fontSize: 12,
    color: "#d97706",
    fontWeight: "600",
  },
  inactiveLabel: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "500",
  },

  // Scan CTA
  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0c4aad",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  scanIcon: {
    fontSize: 32,
    marginRight: 14,
  },
  scanTextBlock: {
    flex: 1,
  },
  scanTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  scanSubtitle: {
    fontSize: 12,
    color: "#a0a8c0",
    lineHeight: 17,
  },
  scanArrow: {
    fontSize: 28,
    color: "#a0a8c0",
    marginLeft: 8,
  },
});
