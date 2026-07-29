/**
 * Design tokens for the BP Connect mobile app.
 *
 * Single source of truth for colors, spacing, radii, typography and shadows.
 * No other file should contain hex literals — import from here instead.
 */
import { Platform, ViewStyle } from "react-native";

// ─── Colors ────────────────────────────────────────────────────────────────

export const colors = {
  /** Brand deep blue — headings, primary buttons, links */
  primary: "#0c4aad",
  /** Pressed / emphasized variant of primary */
  primaryDark: "#083a8c",
  /** Light blue tint — chip backgrounds, selected states */
  primaryLight: "#e3f2fd",

  /** App background (soft off-white) */
  background: "#f9f9fb",
  /** Card / sheet surface */
  surface: "#ffffff",
  /** Alternate surface — input backgrounds, subtle wells */
  surfaceAlt: "#fafafa",

  /** Standard soft gray border (inputs, cards) */
  border: "#dddddd",
  /** Even lighter divider border */
  borderLight: "#eeeeee",

  /** Dark text accent (near-navy) */
  text: "#1a1a2e",
  /** Secondary text — subtitles, labels */
  textSecondary: "#616161",
  /** Muted text — placeholders, timestamps */
  textMuted: "#9e9e9e",

  error: "#c0392b",
  success: "#43a047",
  warning: "#ffb300",

  /** Lead temperature colors */
  hot: "#e53935",
  warm: "#fb8c00",
  cold: "#1e88e5",
  /** Neutral fallback when no temperature is set */
  neutral: "#757575",

  /** Soft pill/tint backgrounds (badge fills, info boxes) */
  successSoft: "#e8f5e9",
  warningSoft: "#fff8e1",
  errorSoft: "#ffebee",
  hotSoft: "#ffebee",
  warmSoft: "#fff3e0",

  /** Darker text-on-tint accents */
  hotDark: "#c62828",
  warmDark: "#e65100",
  coldDark: "#1565c0",

  white: "#ffffff",
} as const;

// ─── Spacing ───────────────────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// ─── Radius ────────────────────────────────────────────────────────────────

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

// ─── Typography ────────────────────────────────────────────────────────────

export const type = {
  family: {
    regular: "OmnesRegular",
    medium: "OmnesMedium",
    semiBold: "OmnesSemiBold",
    bold: "OmnesBold",
  },
  size: {
    h1: 28,
    h2: 22,
    h3: 18,
    body: 16,
    caption: 13,
    tiny: 11,
  },
} as const;

// ─── Shadow ────────────────────────────────────────────────────────────────

/** Subtle card shadow — matches the existing contact-row / stat-tile look. */
export const shadow: { card: ViewStyle } = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    default: {
      elevation: 2,
    },
  }),
};

// ─── Helpers ───────────────────────────────────────────────────────────────

export type LeadTemperature = "Hot" | "Warm" | "Cold";

/** Palette used for name-derived avatar colors (brand-adjacent, readable with white text). */
const AVATAR_PALETTE = [
  colors.primary,
  colors.cold,
  "#00897b", // teal
  "#7b1fa2", // purple
  "#c2185b", // magenta
  colors.warm,
  "#5e35b1", // deep violet
  "#00838f", // cyan-dark
] as const;

/**
 * Deterministic avatar background color derived from a name.
 * Same name always yields the same color.
 */
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/**
 * Color for a lead temperature (Hot / Warm / Cold), neutral gray when unset.
 * Ported from the duplicated helpers in ContactsScreen / ContactDetailScreen.
 */
export function temperatureColor(t?: LeadTemperature): string {
  switch (t) {
    case "Hot":
      return colors.hot;
    case "Warm":
      return colors.warm;
    case "Cold":
      return colors.cold;
    default:
      return colors.neutral;
  }
}

/**
 * Color for a profile-completeness score (0–100).
 * >= 80 green, >= 50 amber, otherwise red — same thresholds as the screens.
 */
export function completenessColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 50) return colors.warning;
  return colors.hot;
}

export const theme = { colors, spacing, radius, type, shadow } as const;
export type Theme = typeof theme;
