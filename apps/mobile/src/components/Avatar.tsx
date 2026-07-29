import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { avatarColor, colors, type } from "../theme";

export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps {
  /** Full name — used for both initials and the derived background color */
  name: string;
  size?: AvatarSize;
  /** Override the derived background color (e.g. temperatureColor(temp)) */
  color?: string;
  style?: ViewStyle;
}

const DIAMETER: Record<AvatarSize, number> = { sm: 32, md: 44, lg: 88 };
const FONT: Record<AvatarSize, number> = { sm: 12, md: 16, lg: 32 };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

/** Initials avatar with a deterministic name-derived background color. */
export default function Avatar({
  name,
  size = "md",
  color,
  style,
}: AvatarProps) {
  const d = DIAMETER[size];
  return (
    <View
      style={[
        styles.circle,
        {
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: color ?? avatarColor(name),
        },
        style,
      ]}
      accessibilityLabel={`Avatar for ${name}`}
    >
      <Text style={[styles.text, { fontSize: FONT[size] }]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: colors.white,
    fontFamily: type.family.bold,
    fontWeight: "700",
  },
});
