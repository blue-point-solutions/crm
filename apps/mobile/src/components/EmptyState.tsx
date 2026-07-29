import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, type } from "../theme";
import AppButton from "./AppButton";

export interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Centered empty-list placeholder: icon, title, message, optional action. */
export default function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <AppButton
          title={actionLabel}
          onPress={onAction}
          variant="primary"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: type.size.body,
    fontFamily: type.family.semiBold,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: "center",
  },
  message: {
    fontSize: type.size.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  action: {
    marginTop: spacing.lg,
  },
});
