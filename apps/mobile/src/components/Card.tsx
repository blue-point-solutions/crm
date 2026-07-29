import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { colors, radius, shadow, spacing } from "../theme";

export interface CardProps {
  children: React.ReactNode;
  /** Inner padding — defaults to spacing.lg-ish 14 to match existing cards */
  padding?: number;
  style?: ViewStyle;
}

/** White surface card with the app's soft shadow and large radius. */
export default function Card({
  children,
  padding = 14,
  style,
}: CardProps) {
  return <View style={[styles.card, { padding }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginVertical: spacing.xs,
    ...shadow.card,
  },
});
