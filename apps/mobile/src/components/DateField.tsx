import React, { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, type as typo } from "../theme";

export interface DateFieldProps {
  label: string;
  /** ISO date (YYYY-MM-DD) or empty/undefined. */
  value?: string;
  onChange: (isoDate: string | undefined) => void;
  placeholder?: string;
  minimumDate?: Date;
}

function toDate(iso?: string): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pretty(iso?: string): string | null {
  if (!iso) return null;
  const d = toDate(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Native date picker behind a themed field row — replaces the free-text
 * "YYYY-MM-DD" inputs. Android shows the modal picker on tap; iOS renders
 * the inline spinner beneath the row while open. A clear (✕) affordance
 * removes the date.
 */
export default function DateField({
  label,
  value,
  onChange,
  placeholder = "Pick a date",
  minimumDate,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "set" && selected) onChange(toIso(selected));
  };

  const display = pretty(value);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.field}
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display ?? "not set"}`}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.value, !display && styles.placeholder]}>
            {display ?? placeholder}
          </Text>
        </TouchableOpacity>
        {display && (
          <TouchableOpacity
            style={styles.clear}
            onPress={() => {
              setOpen(false);
              onChange(undefined);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {open && (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleChange}
          minimumDate={minimumDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: {
    fontSize: typo.size.caption,
    fontWeight: "600",
    fontFamily: typo.family.semiBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  row: { flexDirection: "row", alignItems: "center" },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.surfaceAlt,
    minHeight: 44,
  },
  value: { fontSize: 15, color: colors.text },
  placeholder: { color: colors.textMuted },
  clear: { marginLeft: spacing.sm },
});
