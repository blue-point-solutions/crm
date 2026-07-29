import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing, type } from "../theme";

export type ToastVariant = "success" | "error" | "info";

interface ToastState {
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Show a toast; auto-dismisses after 2.5s */
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 2500;

const VARIANT: Record<
  ToastVariant,
  { bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }
> = {
  success: { bg: colors.success, icon: "checkmark-circle" },
  error: { bg: colors.error, icon: "alert-circle" },
  info: { bg: colors.text, icon: "information-circle" },
};

/**
 * Lightweight self-hiding toast. Wrap the app in <ToastProvider> and call
 * useToast().show("Saved", "success") anywhere below it.
 * Uses RN Animated only — no reanimated dependency.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 80,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  }, [translateY, opacity]);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ message, variant });
      translateY.setValue(80);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      hideTimer.current = setTimeout(hide, AUTO_DISMISS_MS);
    },
    [translateY, opacity, hide]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              backgroundColor: VARIANT[toast.variant].bg,
              bottom: insets.bottom + spacing.xl,
              transform: [{ translateY }],
              opacity,
            },
          ]}
        >
          <Ionicons
            name={VARIANT[toast.variant].icon}
            size={18}
            color={colors.white}
            style={styles.icon}
          />
          <Text style={styles.text} numberOfLines={2}>
            {toast.message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    flex: 1,
    color: colors.white,
    fontSize: type.size.caption + 1,
    fontFamily: type.family.semiBold,
    fontWeight: "600",
  },
});
