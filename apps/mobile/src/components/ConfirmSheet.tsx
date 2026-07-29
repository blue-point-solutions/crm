import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, type } from "../theme";
import AppButton from "./AppButton";

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the danger (red) style */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Simple confirm dialog (bottom-sheet style, Modal-based).
 *
 * const [visible, setVisible] = useState(false);
 * <ConfirmSheet
 *   visible={visible}
 *   title="Delete contact?"
 *   message="This cannot be undone."
 *   confirmLabel="Delete"
 *   destructive
 *   onConfirm={() => { setVisible(false); doDelete(); }}
 *   onCancel={() => setVisible(false)}
 * />
 */
export default function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onCancel}
        accessibilityLabel="Dismiss dialog"
      >
        {/* Inner touchable swallows presses so tapping the sheet doesn't dismiss */}
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <AppButton
            title={confirmLabel}
            onPress={onConfirm}
            variant={destructive ? "danger" : "primary"}
            style={styles.confirm}
          />
          <AppButton title={cancelLabel} onPress={onCancel} variant="ghost" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const BACKDROP = "rgba(0,0,0,0.45)";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: BACKDROP,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    ...shadow.card,
  },
  title: {
    fontSize: type.size.h3,
    fontFamily: type.family.bold,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: type.size.body - 2,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  confirm: {
    marginBottom: spacing.sm,
  },
});
