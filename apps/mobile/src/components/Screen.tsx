import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, type } from "../theme";

export interface ScreenProps {
  title?: string;
  /** When set, renders a back chevron on the left that calls this */
  onBack?: () => void;
  /** Optional element rendered on the right side of the header */
  right?: React.ReactNode;
  /** Wrap content in a keyboard-aware ScrollView */
  scroll?: boolean;
  children: React.ReactNode;
}

/**
 * SafeArea-aware page wrapper with a consistent header and status-bar
 * handling (dark content on the light app background), matching the
 * inset-padding pattern used by the existing screens.
 */
export default function Screen({
  title,
  onBack,
  right,
  scroll = false,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const header =
    title || onBack || right ? (
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.right}>{right}</View>
      </View>
    ) : null;

  const body = scroll ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  ) : (
    <View style={styles.flex}>{children}</View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      {header}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    marginRight: spacing.sm,
    marginLeft: -spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: type.size.h1,
    fontFamily: type.family.bold,
    fontWeight: "700",
    color: colors.primary,
  },
  right: {
    marginLeft: spacing.sm,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
});
