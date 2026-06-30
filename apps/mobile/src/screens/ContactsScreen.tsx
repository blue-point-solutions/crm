import React, { useState, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/types";
import { ContactListItem, MOCK_CONTACTS } from "../api/contacts";

type ContactsNavProp = NativeStackNavigationProp<RootStackParamList, "Contacts">;

type LeadTemp = "Hot" | "Warm" | "Cold";

// ─── Helpers ───────────────────────────────────────────────────────────────

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function avatarColor(temp?: LeadTemp): string {
  switch (temp) {
    case "Hot":  return "#e53935";
    case "Warm": return "#fb8c00";
    case "Cold": return "#1e88e5";
    default:     return "#757575";
  }
}

function badgeColor(temp?: LeadTemp): string {
  switch (temp) {
    case "Hot":  return "#ffebee";
    case "Warm": return "#fff3e0";
    case "Cold": return "#e3f2fd";
    default:     return "#f5f5f5";
  }
}

function badgeTextColor(temp?: LeadTemp): string {
  switch (temp) {
    case "Hot":  return "#c62828";
    case "Warm": return "#e65100";
    case "Cold": return "#1565c0";
    default:     return "#616161";
  }
}

function completenessBarColor(score: number): string {
  if (score >= 80) return "#43a047";
  if (score >= 50) return "#ffb300";
  return "#e53935";
}

function tempLabel(temp?: LeadTemp): string {
  switch (temp) {
    case "Hot":  return "🔥 Hot";
    case "Warm": return "🌡 Warm";
    case "Cold": return "❄️ Cold";
    default:     return "";
  }
}

// ─── ContactRow ────────────────────────────────────────────────────────────

interface ContactRowProps {
  item: ContactListItem;
  onPress: () => void;
}

function ContactRow({ item, onPress }: ContactRowProps) {
  const temp = item.leadTemperature as LeadTemp | undefined;
  const barColor = completenessBarColor(item.completenessScore);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.rowContent}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor(temp) }]}>
          <Text style={styles.avatarText}>
            {initials(item.firstName, item.lastName)}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.infoTop}>
            <View style={styles.infoText}>
              <Text style={styles.name}>
                {item.firstName} {item.lastName}
              </Text>
              <Text style={styles.company} numberOfLines={1}>
                {item.company}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {item.email ?? "No email"}
              </Text>
            </View>

            {/* Right column: badge + score */}
            <View style={styles.rightCol}>
              {temp ? (
                <View style={[styles.badge, { backgroundColor: badgeColor(temp) }]}>
                  <Text style={[styles.badgeText, { color: badgeTextColor(temp) }]}>
                    {tempLabel(temp)}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.scoreText}>{item.completenessScore}%</Text>
            </View>
          </View>

          {/* Completeness bar */}
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${item.completenessScore}%` as any, backgroundColor: barColor },
              ]}
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── ContactsScreen ────────────────────────────────────────────────────────

export default function ContactsScreen() {
  const navigation = useNavigation<ContactsNavProp>();

  const [query, setQuery] = useState("");
  const [tempFilter, setTempFilter] = useState<LeadTemp | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = MOCK_CONTACTS.filter((c) => {
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false);

    const matchesTemp = !tempFilter || c.leadTemperature === tempFilter;

    return matchesQuery && matchesTemp;
  });

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Simulate async refresh
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const CHIPS: Array<{ label: string; value: LeadTemp | null }> = [
    { label: "All", value: null },
    { label: "🔥 Hot", value: "Hot" },
    { label: "🌡 Warm", value: "Warm" },
    { label: "❄️ Cold", value: "Cold" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filtered.length}</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, company or email…"
          placeholderTextColor="#9e9e9e"
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {CHIPS.map((chip) => {
          const active = tempFilter === chip.value;
          return (
            <TouchableOpacity
              key={chip.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setTempFilter(chip.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
            <ContactRow
              item={item}
              onPress={() => navigation.navigate("ContactDetail", { contactId: item.id })}
            />
          )}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No contacts found.</Text>
            {(query !== "" || tempFilter !== null) && (
              <TouchableOpacity
                onPress={() => {
                  setQuery("");
                  setTempFilter(null);
                }}
                style={styles.clearBtn}
              >
                <Text style={styles.clearBtnText}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("CameraPermission")}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9f9fb",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0c4aad",
  },
  countBadge: {
    marginLeft: 10,
    backgroundColor: "#0c4aad",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: "center",
  },
  countText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#ebebef",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#0c4aad",
  },

  // Chips
  chipsScroll: {
    flexGrow: 0,
    marginBottom: 6,
  },
  chipsContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#e0e0e0",
  },
  chipActive: {
    backgroundColor: "#0c4aad",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#424242",
  },
  chipTextActive: {
    color: "#ffffff",
  },

  // List
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Row
  row: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginVertical: 4,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  // Avatar
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  avatarText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },

  // Info
  info: {
    flex: 1,
  },
  infoTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  infoText: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0c4aad",
    marginBottom: 2,
  },
  company: {
    fontSize: 13,
    color: "#757575",
    marginBottom: 2,
  },
  email: {
    fontSize: 12,
    color: "#9e9e9e",
    fontStyle: "italic",
  },

  // Right column
  rightCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  scoreText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#757575",
  },

  // Completeness bar
  barTrack: {
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },

  // Empty state
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#9e9e9e",
    marginBottom: 16,
  },
  clearBtn: {
    backgroundColor: "#0c4aad",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  clearBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: 28,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0c4aad",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  fabIcon: {
    color: "#ffffff",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "300",
  },
});
