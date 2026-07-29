import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, radius, spacing, type } from "../theme";

export type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "hot"
  | "warm"
  | "cold";

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

/** background / text color pairs per variant (soft pill + strong text). */
const VARIANT: Record<BadgeVariant, { bg: string; fg: string }> = {
  default: { bg: colors.borderLight, fg: colors.textSecondary },
  primary: { bg: colors.primaryLight, fg: colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warmDark },
  error: { bg: colors.errorSoft, fg: colors.error },
  hot: { bg: colors.hotSoft, fg: colors.hotDark },
  warm: { bg: colors.warmSoft, fg: colors.warmDark },
  cold: { bg: colors.primaryLight, fg: colors.coldDark },
};

/** Small pill badge for temperature / status / tags. */
export default function Badge({
  label,
  variant = "default",
  style,
}: BadgeProps) {
  const { bg, fg } = VARIANT[variant];
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: type.size.tiny,
    fontFamily: type.family.semiBold,
    fontWeight: "600",
  },
});
