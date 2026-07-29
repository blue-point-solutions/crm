import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  useToast,
} from "../components";
import { colors, radius, shadow, spacing, type as typo } from "../theme";
import {
  Deal,
  DealStage,
  PipelineBoard,
  advanceDeal,
  getPipeline,
  listDeals,
} from "../api/deals";

type Props = NativeStackScreenProps<RootStackParamList, "Pipeline">;

const OPEN_STAGES: { key: DealStage; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "negotiation", label: "Negotiation" },
];

function peso(value: number): string {
  return `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

export default function PipelineScreen({ navigation }: Props) {
  const toast = useToast();
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [stage, setStage] = useState<DealStage>("lead");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [busyDeal, setBusyDeal] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (selected: DealStage, mode: "initial" | "refresh" | "silent") => {
      const id = ++seq.current;
      if (mode === "initial") {
        setLoading(true);
        setError(false);
      } else if (mode === "refresh") {
        setRefreshing(true);
      }
      try {
        const [b, d] = await Promise.all([
          getPipeline(),
          listDeals({ stage: selected }),
        ]);
        if (id !== seq.current) return;
        setBoard(b);
        setDeals(d.items);
        setError(false);
      } catch {
        if (id !== seq.current) return;
        if (mode === "initial") {
          setError(true);
        } else {
          toast.show("Couldn't refresh the pipeline", "error");
        }
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [toast]
  );

  useFocusEffect(
    useCallback(() => {
      load(stage, board === null ? "initial" : "silent");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, stage])
  );

  const selectStage = useCallback(
    (s: DealStage) => {
      setStage(s);
      load(s, "silent");
    },
    [load]
  );

  const handleAdvance = useCallback(
    async (deal: Deal, toStage: DealStage) => {
      if (busyDeal) return;
      seq.current++; // invalidate in-flight loads
      setBusyDeal(deal.id);
      try {
        await advanceDeal(deal.id, toStage);
        toast.show(
          toStage === "won"
            ? "Deal won! 🎉"
            : toStage === "lost"
              ? "Deal marked lost"
              : "Deal moved",
          toStage === "lost" ? "info" : "success"
        );
      } catch {
        toast.show("Couldn't move the deal", "error");
      } finally {
        setBusyDeal(null);
        load(stage, "silent");
      }
    },
    [busyDeal, toast, load, stage]
  );

  const stageMeta = (key: DealStage) => board?.stages.find((s) => s.key === key);

  return (
    <Screen title="Pipeline" onBack={() => navigation.goBack()}>
      {loading ? (
        <LoadingState label="Loading pipeline…" />
      ) : error || !board ? (
        <ErrorState
          message="Couldn't load the pipeline. Check your connection."
          onRetry={() => load(stage, "initial")}
        />
      ) : (
        <>
          {/* Totals header */}
          <View style={styles.totalsRow}>
            <Card style={styles.totalCard}>
              <Text style={styles.totalValue}>{peso(board.totalOpenValue)}</Text>
              <Text style={styles.totalLabel}>
                {board.totalOpenCount} open deal{board.totalOpenCount === 1 ? "" : "s"}
              </Text>
            </Card>
            <Card style={styles.totalCard}>
              <Text style={styles.totalValue}>
                {board.wonCount}
                <Text style={styles.totalMuted}> / {board.lostCount}</Text>
              </Text>
              <Text style={styles.totalLabel}>won / lost</Text>
            </Card>
          </View>

          {/* Stage tabs */}
          <View style={styles.tabsRow}>
            {OPEN_STAGES.map((s) => {
              const meta = stageMeta(s.key);
              const active = stage === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => selectStage(s.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${s.label}: ${meta?.count ?? 0} deals`}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {s.label}
                  </Text>
                  <Text style={[styles.tabCount, active && styles.tabLabelActive]}>
                    {meta?.count ?? 0}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!!stageMeta(stage)?.value && (
            <Text style={styles.stageValue}>
              {peso(stageMeta(stage)?.value ?? 0)} in {stageMeta(stage)?.label}
            </Text>
          )}

          {/* Deals in the selected stage */}
          <FlatList
            data={deals}
            keyExtractor={(d) => d.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(stage, "refresh")}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={deals.length === 0 && styles.emptyContainer}
            ListEmptyComponent={
              <EmptyState
                icon="trending-up-outline"
                title={`Nothing in ${stageMeta(stage)?.label ?? stage}`}
                message="Deals you move into this stage will show up here. Start deals from a contact's page."
              />
            }
            renderItem={({ item }) => (
              <DealRow
                deal={item}
                busy={busyDeal === item.id}
                anyBusy={busyDeal !== null}
                onOpenContact={() =>
                  navigation.navigate("ContactDetail", { contactId: item.contactId })
                }
                onAdvance={handleAdvance}
              />
            )}
          />
        </>
      )}
    </Screen>
  );
}

function DealRow({
  deal,
  busy,
  anyBusy,
  onOpenContact,
  onAdvance,
}: {
  deal: Deal;
  busy: boolean;
  anyBusy: boolean;
  onOpenContact: () => void;
  onAdvance: (deal: Deal, toStage: DealStage) => void;
}) {
  const forward = deal.allowedTransitions.filter((t) => t.toStage !== "lost");
  const lose = deal.allowedTransitions.find((t) => t.toStage === "lost");
  return (
    <View style={styles.dealCard}>
      <TouchableOpacity
        onPress={onOpenContact}
        accessibilityRole="button"
        accessibilityLabel={`Open ${deal.contactName || "contact"}`}
      >
        <View style={styles.dealHeader}>
          <View style={styles.flex}>
            <Text style={styles.dealContact}>{deal.contactName || "Unknown contact"}</Text>
            {!!deal.title && <Text style={styles.dealTitle}>{deal.title}</Text>}
          </View>
          <Text style={styles.dealValue}>{peso(deal.value)}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.dealActions}>
        {forward.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.actionBtn, (busy || anyBusy) && styles.actionDisabled]}
            onPress={() => onAdvance(deal, t.toStage)}
            disabled={busy || anyBusy}
            accessibilityRole="button"
            accessibilityLabel={`${t.label} for ${deal.contactName}`}
          >
            <Ionicons name="arrow-forward" size={13} color={colors.white} />
            <Text style={styles.actionText}>{t.label}</Text>
          </TouchableOpacity>
        ))}
        {lose && (
          <TouchableOpacity
            style={[styles.loseBtn, (busy || anyBusy) && styles.actionDisabled]}
            onPress={() => onAdvance(deal, "lost")}
            disabled={busy || anyBusy}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${deal.contactName}'s deal lost`}
          >
            <Text style={styles.loseText}>Lost</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  totalsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  totalCard: { flex: 1 },
  totalValue: {
    fontSize: typo.size.h3,
    fontFamily: typo.family.bold,
    fontWeight: "700",
    color: colors.primary,
  },
  totalMuted: { color: colors.textMuted },
  totalLabel: { fontSize: typo.size.caption, color: colors.textSecondary, marginTop: 2 },
  tabsRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    minHeight: 44,
    justifyContent: "center",
  },
  tabActive: { backgroundColor: colors.primary },
  tabLabel: { fontSize: typo.size.tiny + 1, color: colors.textSecondary, fontWeight: "600" },
  tabLabelActive: { color: colors.white },
  tabCount: { fontSize: typo.size.body, fontWeight: "700", color: colors.text },
  stageValue: {
    fontSize: typo.size.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
  dealCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  dealHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dealContact: {
    fontSize: typo.size.body,
    fontFamily: typo.family.semiBold,
    fontWeight: "600",
    color: colors.text,
  },
  dealTitle: { fontSize: typo.size.caption, color: colors.textSecondary, marginTop: 1 },
  dealValue: {
    fontSize: typo.size.body,
    fontFamily: typo.family.bold,
    fontWeight: "700",
    color: colors.primary,
  },
  dealActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minHeight: 36,
  },
  actionText: { color: colors.white, fontSize: typo.size.caption, fontWeight: "600" },
  actionDisabled: { opacity: 0.5 },
  loseBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  loseText: { color: colors.error, fontSize: typo.size.caption, fontWeight: "600" },
});
