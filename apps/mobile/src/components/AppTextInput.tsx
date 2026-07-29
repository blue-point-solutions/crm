import React, { forwardRef } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors, radius, spacing, type } from "../theme";

export interface AppTextInputProps extends TextInputProps {
  label?: string;
  /** Error message shown below the input; also switches the border to the error color */
  error?: string;
  containerStyle?: ViewStyle;
}

const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  function AppTextInput({ label, error, containerStyle, style, ...rest }, ref) {
    return (
      <View style={[styles.container, containerStyle]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <TextInput
          ref={ref}
          style={[styles.input, error ? styles.inputError : null, style]}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          {...rest}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }
);

export default AppTextInput;

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: type.size.caption,
    fontFamily: type.family.semiBold,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: type.size.body,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.error,
  },
  error: {
    color: colors.error,
    fontSize: type.size.caption,
    marginTop: spacing.xs,
  },
});
