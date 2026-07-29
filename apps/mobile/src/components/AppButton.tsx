import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, type } from "../theme";

export type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** Ionicons icon name, rendered left of the title */
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  accessibilityLabel?: string;
  style?: ViewStyle;
}

const TEXT_COLOR: Record<AppButtonVariant, string> = {
  primary: colors.white,
  secondary: colors.primary,
  ghost: colors.primary,
  danger: colors.white,
};

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  accessibilityLabel,
  style,
}: AppButtonProps) {
  const inactive = disabled || loading;
  const textColor = TEXT_COLOR[variant];

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], inactive && styles.disabled, style]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={textColor}
              style={styles.icon}
            />
          ) : null}
          <Text style={[styles.text, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: colors.error,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    fontSize: type.size.body,
    fontFamily: type.family.semiBold,
    fontWeight: "600",
  },
});
