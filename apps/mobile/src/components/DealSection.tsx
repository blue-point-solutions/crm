import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import AppButton from "./AppButton";
import AppTextInput from "./AppTextInput";
import ConfirmSheet from "./ConfirmSheet";
import { useToast } from "./Toast";
import { colors, radius, spacing, type as typo } from "../theme";
import {
  Deal,
  DealStage,
  advanceDeal,
  createDeal,
  listDeals,
} from "../api/deals";

const STAGE_ORDER: DealStage[] = ["lead", "qualified", "proposal", "negotiation", "won"];

const STAGE_COLORS: Record<DealStage, string> = {
  lead: colors.textMuted,
  qualified: colors.primary,
  proposal: colors.warning,
  negotiation: colors.hot,
  won: colors.success,
  lost: colors.error,
};

/**
 * Parse a user-typed peso amount. Accepts "150000", "150,000", "1500.50",
 * and comma-as-decimal "1500,50" (numeric keyboards on comma-decimal
 * locales); rejects anything ambiguous rather than silently mis-scaling.
 */
export function parsePesoInput(raw: string): number | null {
  const t = raw.replace(/\s/g, "");
  if (t === "") return 0;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) return Number(t.replace(/,/g, ""));
  if (/^\d+(\.\d{1,2})?$/.test(t)) return Number(t);
  if (/^\d+,\d{1,2}$/.test(t)) return Number(t.replace(",", "."));
  return null;
}

function peso(value: number): string {
  return `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

export interface DealSectionProps {
  contactId: string;
  contactName: string;
  /** Called after any deal change so the parent can refresh the timeline. */
  onChanged?: () => void;
}

/**
 * The contact's deal card: shows the open deal with its stage progress and
 * exactly the server-declared legal moves (allowedTransitions), or a
 * start-deal form. Self-contained — fetches its own data so ContactDetail
 * only mounts it.
 */
export default function DealSection({ contactId, contactName, onChanged }: DealSectionProps) {
  const toast = useToast();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [closedCount, setClosedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [title, setTitle] = useState("");
  const [valueText, setValueText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmLost, setConfirmLost] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const [open, closed] = await Promise.all([
        listDeals({ contactId, status: "open" }),
        listDeals({ contactId, status: "completed" }),
      ]);
      if (id !== seq.current) return;
      setDeal(open.items[0] ?? null);
      setClosedCount(closed.total);
      setLoadError(false);
    } catch {
      // Never fall through to the start-deal form on a failed read — the
      // contact may well have an open deal, and starting a second one would
      // orphan it (no one-open-deal constraint server-side).
      if (id === seq.current) setLoadError(true);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [contactId]);

  // Refetch on screen focus — the Pipeline board can advance this contact's
  // deal while ContactDetail sits in the back stack.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleStart = useCallback(async () => {
    if (busy) return;
    const value = parsePesoInput(valueText.trim());
    if (value === null || value < 0) {
      toast.show("Enter the value like 150000 or 150,000", "error");
      return;
    }
    seq.current++; // invalidate any in-flight load
    setBusy(true);
    try {
      const created = await createDeal(contactId, title.trim(), value);
      setDeal(created);
      setStarting(false);
      setTitle("");
      setValueText("");
      toast.show("Deal started", "success");
      onChanged?.();
    } catch {
      toast.show("Couldn't start the deal", "error");
    } finally {
      setBusy(false);
    }
  }, [busy, contactId, title, valueText, toast, onChanged]);

  const handleAdvance = useCallback(
    async (toStage: DealStage) => {
      if (!deal || busy) return;
      seq.current++; // invalidate any in-flight load
      setBusy(true);
      try {
        const updated = await advanceDeal(deal.id, toStage);
        setDeal(updated.status === "open" ? updated : null);
        if (updated.status !== "open") setClosedCount((n) => n + 1);
        toast.show(
          toStage === "won"
            ? "Deal won! 🎉"
            : toStage === "lost"
              ? "Deal marked lost"
              : `Moved to ${updated.stageLabel}`,
          toStage === "lost" ? "info" : "success"
        );
        onChanged?.();
      } catch {
        toast.show("Couldn't update the deal — reloading", "error");
        load();
      } finally {
        setBusy(false);
      }
    },
    [deal, busy, toast, onChanged, load]
  );

  if (loading) return null;

  if (loadError) {
    return (
      <TouchableOpacity
        style={styles.errorRow}
        onPress={() => {
          setLoading(true);
          load();
        }}
        accessibilityRole="button"
        accessibilityLabel="Retry loading deal"
      >
        <Ionicons name="refresh" size={16} color={colors.textSecondary} />
        <Text style={styles.errorText}>Couldn't load deal info — tap to retry</Text>
      </TouchableOpacity>
    );
  }

  // ── No open deal ────────────────────────────────────────────────────────
  if (!deal) {
    return (
      <View>
        {closedCount > 0 && (
          <Text style={styles.closedNote}>
            {closedCount} past deal{closedCount === 1 ? "" : "s"} on record
          </Text>
        )}
        {starting ? (
          <View>
            <AppTextInput
              label="Deal title"
              placeholder={`e.g. ${contactName || "New"} proposal`}
              value={title}
              onChangeText={setTitle}
            />
            <AppTextInput
              label="Value (₱)"
              placeholder="0"
              keyboardType="numeric"
              value={valueText}
              onChangeText={setValueText}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppButton
                  title="Start Deal"
                  onPress={handleStart}
                  loading={busy}
                  disabled={busy}
                />
              </View>
              <View style={styles.flex}>
                <AppButton
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setStarting(false)}
                  disabled={busy}
                />
              </View>
            </View>
          </View>
        ) : (
          <AppButton
            title="Start a Deal"
            variant="secondary"
            icon="trending-up-outline"
            onPress={() => setStarting(true)}
          />
        )}
      </View>
    );
  }

  // ── Open deal ───────────────────────────────────────────────────────────
  const stageIdx = STAGE_ORDER.indexOf(deal.stage);
  const forward = deal.allowedTransitions.filter((t) => t.toStage !== "lost");
  const canLose = deal.allowedTransitions.some((t) => t.toStage === "lost");

  return (
    <View>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          {!!deal.title && <Text style={styles.title}>{deal.title}</Text>}
          <Text style={styles.value}>{peso(deal.value)}</Text>
        </View>
        <View
          style={[styles.stagePill, { backgroundColor: STAGE_COLORS[deal.stage] }]}
          accessibilityLabel={`Deal stage: ${deal.stageLabel}`}
        >
          <Text style={styles.stagePillText}>{deal.stageLabel}</Text>
        </View>
      </View>

      {/* Stage progress dots (lost handled by pill color) */}
      <View style={styles.progressRow} accessibilityLabel={`Stage ${stageIdx + 1} of ${STAGE_ORDER.length}`}>
        {STAGE_ORDER.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && (
              <View
                style={[styles.progressLine, i <= stageIdx && styles.progressLineDone]}
              />
            )}
            <View
              style={[styles.progressDot, i <= stageIdx && styles.progressDotDone]}
            >
              {i < stageIdx && (
                <Ionicons name="checkmark" size={10} color={colors.white} />
              )}
            </View>
          </React.Fragment>
        ))}
      </View>

      <View style={styles.row}>
        {forward.map((t) => (
          <View key={t.key} style={styles.flex}>
            <AppButton
              title={t.label}
              onPress={() => handleAdvance(t.toStage)}
              loading={busy}
              disabled={busy}
            />
          </View>
        ))}
        {canLose && (
          <TouchableOpacity
            style={styles.loseButton}
            onPress={() => setConfirmLost(true)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Mark deal lost"
          >
            <Ionicons name="close-circle-outline" size={18} color={colors.error} />
            <Text style={styles.loseText}>Lost</Text>
          </TouchableOpacity>
        )}
      </View>

      <ConfirmSheet
        visible={confirmLost}
        title="Mark Deal Lost?"
        message={`${deal.title || "This deal"} (${peso(deal.value)}) will be closed as lost.`}
        confirmLabel="Mark Lost"
        destructive
        onConfirm={() => {
          setConfirmLost(false);
          handleAdvance("lost");
        }}
        onCancel={() => setConfirmLost(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  closedNote: {
    fontSize: typo.size.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  flex: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: typo.size.body,
    fontFamily: typo.family.semiBold,
    fontWeight: "600",
    color: colors.text,
  },
  value: {
    fontSize: typo.size.h3,
    fontFamily: typo.family.bold,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 2,
  },
  stagePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  stagePillText: {
    color: colors.white,
    fontSize: typo.size.caption,
    fontWeight: "700",
    fontFamily: typo.family.semiBold,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  progressDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotDone: { backgroundColor: colors.primary },
  progressLine: { flex: 1, height: 2, backgroundColor: colors.border },
  progressLineDone: { backgroundColor: colors.primary },
  loseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: "center",
  },
  loseText: { color: colors.error, fontSize: typo.size.caption + 1, fontWeight: "600" },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
  },
  errorText: { color: colors.textSecondary, fontSize: typo.size.caption + 1 },
});
