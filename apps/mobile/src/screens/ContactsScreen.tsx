import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import {
  ContactListItem,
  listContacts,
  toggleFavorite,
} from "../api/contacts";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  useToast,
} from "../components";
import {
  colors,
  completenessColor,
  LeadTemperature,
  radius,
  shadow,
  spacing,
  temperatureColor,
  type,
} from "../theme";

type ContactsNavProp = NativeStackNavigationProp<RootStackParamList, "Contacts">;

/** List rows may carry a favorite flag from the API. */
type Row = ContactListItem & { favorite?: boolean };

type SortMode = "recent" | "name";
type FetchMode = "initial" | "refresh" | "silent" | "more";

const PAGE_SIZE = 20;

const TEMP_BADGE_VARIANT: Record<LeadTemperature, "hot" | "warm" | "cold"> = {
  Hot: "hot",
  Warm: "warm",
  Cold: "cold",
};

const TEMP_CHIP_ICON: Record<
  LeadTemperature,
  React.ComponentProps<typeof Ionicons>["name"]
> = {
  Hot: "flame",
  Warm: "thermometer",
  Cold: "snow",
};

// ─── ContactRow ────────────────────────────────────────────────────────────

interface ContactRowProps {
  item: Row;
  onPress: () => void;
  onToggleFavorite: () => void;
}

const ContactRow = React.memo(function ContactRow({
  item,
  onPress,
  onToggleFavorite,
}: ContactRowProps) {
  const temp = item.leadTemperature;
  const fullName = `${item.firstName} ${item.lastName}`.trim();
  const barColor = completenessColor(item.completenessScore);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${fullName}, ${item.company}${
        temp ? `, ${temp} lead` : ""
      }, ${item.completenessScore} percent complete. Opens contact details.`}
    >
      <View style={styles.rowContent}>
        <Avatar
          name={fullName}
          size="md"
          color={temp ? temperatureColor(temp) : undefined}
          style={styles.avatar}
        />

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.infoTop}>
            <View style={styles.infoText}>
              <Text style={styles.name}>{fullName}</Text>
              <Text style={styles.company} numberOfLines={1}>
                {item.company}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {item.email ?? "No email"}
              </Text>
            </View>

            {/* Right column: favorite + badge + score */}
            <View style={styles.rightCol}>
              <TouchableOpacity
                onPress={onToggleFavorite}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={
                  item.favorite
                    ? `Remove ${fullName} from favorites`
                    : `Add ${fullName} to favorites`
                }
              >
                <Ionicons
                  name={item.favorite ? "star" : "star-outline"}
                  size={20}
                  color={item.favorite ? colors.warning : colors.textMuted}
                />
              </TouchableOpacity>
              {temp ? (
                <Badge label={temp} variant={TEMP_BADGE_VARIANT[temp]} />
              ) : null}
              <Text style={styles.scoreText}>{item.completenessScore}%</Text>
            </View>
          </View>

          {/* Completeness bar */}
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${item.completenessScore}%` as const,
                  backgroundColor: barColor,
                },
              ]}
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Chip ──────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  active: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

function Chip({ label, icon, active, onPress, accessibilityLabel }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? `Filter: ${label}`}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={active ? colors.white : colors.textSecondary}
          style={styles.chipIcon}
        />
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── ContactsScreen ────────────────────────────────────────────────────────

export default function ContactsScreen() {
  const navigation = useNavigation<ContactsNavProp>();
  const toast = useToast();

  // Filters
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tempFilter, setTempFilter] = useState<LeadTemperature | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>("recent");

  // Data
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  /** Monotonic id so stale responses never clobber newer ones. */
  const requestSeq = useRef(0);

  // Debounced search (350ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const fetchPage = useCallback(
    async (pageNum: number, mode: FetchMode) => {
      const id = ++requestSeq.current;
      if (mode === "initial") {
        setLoading(true);
        setError(false);
      } else if (mode === "refresh") {
        setRefreshing(true);
      } else if (mode === "more") {
        setLoadingMore(true);
      }

      try {
        const res = await listContacts({
          q: debouncedQ || undefined,
          leadTemperature: tempFilter ?? undefined,
          favorite: favoritesOnly || undefined,
          sort,
          page: pageNum,
          pageSize: PAGE_SIZE,
        });
        if (id !== requestSeq.current) return;
        setItems((prev) =>
          pageNum > 1 ? [...prev, ...(res.items as Row[])] : (res.items as Row[])
        );
        setTotal(res.total);
        setPage(res.page);
        setError(false);
      } catch {
        if (id !== requestSeq.current) return;
        if (mode === "initial") {
          setError(true);
        } else {
          toast.show("Couldn't load contacts. Please try again.", "error");
        }
      } finally {
        if (id === requestSeq.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedQ, tempFilter, favoritesOnly, sort, toast]
  );

  // Initial load + reload whenever a filter/sort/search changes.
  useEffect(() => {
    fetchPage(1, "initial");
  }, [fetchPage]);

  // Refetch on focus (e.g. returning from a save) — but not on first mount,
  // and not tied to fetchPage identity so filter changes don't double-fetch.
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  }, [fetchPage]);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      fetchRef.current(1, "silent");
    }, [])
  );

  const handleRefresh = useCallback(() => {
    fetchPage(1, "refresh");
  }, [fetchPage]);

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || refreshing || error) return;
    if (items.length >= total) return;
    fetchPage(page + 1, "more");
  }, [loading, loadingMore, refreshing, error, items.length, total, page, fetchPage]);

  const handleToggleFavorite = useCallback(
    async (id: string) => {
      let previous: boolean | undefined;
      setItems((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          previous = c.favorite;
          return { ...c, favorite: !c.favorite };
        })
      );
      try {
        const res = await toggleFavorite(id);
        setItems((prev) =>
          prev.map((c) => (c.id === id ? { ...c, favorite: res.favorite } : c))
        );
      } catch {
        setItems((prev) =>
          prev.map((c) => (c.id === id ? { ...c, favorite: previous } : c))
        );
        toast.show("Couldn't update favorite. Please try again.", "error");
      }
    },
    [toast]
  );

  const hasFilters = debouncedQ !== "" || tempFilter !== null || favoritesOnly;

  const clearFilters = useCallback(() => {
    setQuery("");
    setDebouncedQ("");
    setTempFilter(null);
    setFavoritesOnly(false);
  }, []);

  const listEmpty = hasFilters ? (
    <EmptyState
      icon="search-outline"
      title="No matching contacts"
      message="Try a different search or clear your filters."
      actionLabel="Clear Filters"
      onAction={clearFilters}
    />
  ) : (
    <EmptyState
      icon="people-outline"
      title="No contacts yet"
      message="Scan a business card to add your first contact."
      actionLabel="Scan Card"
      onAction={() => navigation.navigate("CameraPermission")}
    />
  );

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
        <View style={styles.countBadge} accessibilityLabel={`${total} contacts`}>
          <Text style={styles.countText}>{total}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => navigation.navigate("ImportExport")}
          accessibilityRole="button"
          accessibilityLabel="Import and export contacts"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="swap-vertical-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons
          name="search"
          size={16}
          color={colors.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, company or email…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search contacts"
        />
        {query !== "" ? (
          <TouchableOpacity
            onPress={() => setQuery("")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter + sort chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          label="All"
          active={tempFilter === null}
          onPress={() => setTempFilter(null)}
          accessibilityLabel="Show all temperatures"
        />
        {(["Hot", "Warm", "Cold"] as const).map((t) => (
          <Chip
            key={t}
            label={t}
            icon={TEMP_CHIP_ICON[t]}
            active={tempFilter === t}
            onPress={() => setTempFilter((cur) => (cur === t ? null : t))}
            accessibilityLabel={`Filter by ${t} leads`}
          />
        ))}
        <Chip
          label="Favorites"
          icon="star"
          active={favoritesOnly}
          onPress={() => setFavoritesOnly((f) => !f)}
          accessibilityLabel="Show favorites only"
        />
        <View style={styles.chipDivider} />
        <Chip
          label="Recent"
          icon="time-outline"
          active={sort === "recent"}
          onPress={() => setSort("recent")}
          accessibilityLabel="Sort by most recent"
        />
        <Chip
          label="Name"
          icon="swap-vertical"
          active={sort === "name"}
          onPress={() => setSort("name")}
          accessibilityLabel="Sort by name"
        />
      </ScrollView>

      {/* List / states */}
      {loading ? (
        <LoadingState label="Loading contacts…" />
      ) : error && items.length === 0 ? (
        <ErrorState
          title="Couldn't load contacts"
          onRetry={() => fetchPage(1, "initial")}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ContactRow
              item={item}
              onPress={() =>
                navigation.navigate("ContactDetail", { contactId: item.id })
              }
              onToggleFavorite={() => handleToggleFavorite(item.id)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            items.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={listEmpty}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("CameraPermission")}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Scan Card"
      >
        <Ionicons name="camera" size={26} color={colors.white} />
      </TouchableOpacity>
    </Screen>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: type.size.h1,
    fontWeight: "700",
    fontFamily: type.family.bold,
    color: colors.primary,
  },
  countBadge: {
    marginLeft: 10,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: "center",
  },
  countText: {
    color: colors.white,
    fontSize: type.size.caption,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
  },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    backgroundColor: "#ebebef",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.primary,
  },

  // Chips
  chipsScroll: {
    flexGrow: 0,
    marginBottom: 6,
  },
  chipsContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#e0e0e0",
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipIcon: {
    marginRight: spacing.xs,
  },
  chipText: {
    fontSize: type.size.caption,
    fontWeight: "500",
    fontFamily: type.family.medium,
    color: "#424242",
  },
  chipTextActive: {
    color: colors.white,
  },
  chipDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },

  // Row
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginVertical: spacing.xs,
    padding: spacing.md,
    ...shadow.card,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatar: {
    marginRight: spacing.md,
    flexShrink: 0,
  },

  // Info
  info: {
    flex: 1,
  },
  infoTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  infoText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: type.family.bold,
    color: colors.primary,
    marginBottom: 2,
  },
  company: {
    fontSize: type.size.caption,
    color: colors.neutral,
    marginBottom: 2,
  },
  email: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
  },

  // Right column
  rightCol: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  scoreText: {
    fontSize: type.size.tiny,
    fontWeight: "600",
    fontFamily: type.family.semiBold,
    color: colors.neutral,
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

  // FAB
  fab: {
    position: "absolute",
    bottom: 28,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});
