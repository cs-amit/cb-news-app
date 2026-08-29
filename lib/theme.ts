// Design tokens from docs/superpowers/specs/2026-08-25-visual-identity-design.md.
// Exact hex values are non-negotiable — copy from the spec, never approximate.

export const colors = {
  textPrimary: "#111827",
  textSecondary: "#667085",
  border: "#D9DDE3",
  surfaceSubtle: "#EEF0F2",
  background: "#FFFFFF",
  surfaceElevated: "#F7F7F5",
  primary: "#315A9B",
  navy: "#0B1B33",
  emphasis: "#3F4FC4",
  red: "#D9382E",
} as const;

export const fonts = {
  headline: "SourceSerif4_700Bold",
  ui: "Sora_400Regular",
  uiSemiBold: "Sora_600SemiBold",
} as const;

export type Verdict = "True" | "False" | "Misleading" | "Unverified";

export const verdictColors: Record<Verdict, { text: string; background: string }> = {
  True: { text: "#2E9B57", background: "#E6F3EA" },
  False: { text: colors.red, background: "#FBEAE9" },
  Misleading: { text: "#D9A82E", background: "#FBF1E1" },
  Unverified: { text: colors.textSecondary, background: colors.surfaceSubtle },
};

export type PollResponse = "critical" | "balanced" | "friendly";

export const pollColors: Record<PollResponse, string> = {
  critical: colors.navy,
  balanced: colors.primary,
  friendly: colors.emphasis,
};
