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

// Text colors darkened per the spec's 2026-08-29 contrast amendment — every
// pair now clears WCAG AA (≥ 4.5:1) on the unchanged backgrounds. Badge text
// renders at 12px (see app/story/[id].tsx).
export const verdictColors: Record<Verdict, { text: string; background: string }> = {
  True: { text: "#1B7A3D", background: "#E6F3EA" },
  False: { text: "#C42B21", background: "#FBEAE9" },
  Misleading: { text: "#8A6410", background: "#FBF1E1" },
  Unverified: { text: "#55606E", background: colors.surfaceSubtle },
};

export type PollResponse = "critical" | "balanced" | "friendly";

export const pollColors: Record<PollResponse, string> = {
  critical: colors.navy,
  balanced: colors.primary,
  friendly: colors.emphasis,
};
