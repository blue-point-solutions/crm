import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../theme";

export interface LoadingStateProps {
  label?: string;
}

/** Centered spinner with an optional label. */
export default function LoadingState({ label }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  label: {
    fontSize: type.size.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});
