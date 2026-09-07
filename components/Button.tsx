import { Pressable, Text, ActivityIndicator, StyleProp, ViewStyle } from "react-native";
import { colors, fonts } from "../lib/theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Shared primary-CTA chrome. Before this, every "submit"-style action in the
// app (send confirmation link, quiz submit, notification opt-in, etc.) was
// just colored text with no button shape -- indistinguishable from a plain
// nav link, part of what read as "gimmicky" rather than a real app. Reserved
// for genuine submit/confirm actions; lightweight in-content links (share,
// "retake the quiz" nav) stay icon+text on purpose, not every tappable thing.
export function Button({ label, onPress, variant = "primary", disabled, loading, style }: ButtonProps) {
  const isPrimary = variant === "primary";
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        {
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isPrimary ? (isDisabled ? colors.surfaceSubtle : colors.primary) : "transparent",
          borderWidth: isPrimary ? 0 : 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.background : colors.primary} size="small" />
      ) : (
        <Text
          style={{
            fontFamily: fonts.uiSemiBold,
            color: isPrimary ? (isDisabled ? colors.textSecondary : colors.background) : colors.textSecondary,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
