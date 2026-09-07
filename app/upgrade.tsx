import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { isValidHandle, savePendingHandle } from "../lib/handle";
import { colors, fonts } from "../lib/theme";
import { Button } from "../components/Button";

export default function UpgradeScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit() {
    if (!email.trim()) return;
    const trimmedHandle = handle.trim().toLowerCase();
    if (!isValidHandle(trimmedHandle)) {
      setErrorMessage("Handle must be 3-20 characters: lowercase letters, digits, or underscore.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    // Supabase's documented anonymous-user linking flow: calling
    // updateUser({ email }) while signed in anonymously sends a
    // confirmation email and, once confirmed, converts THIS SAME uid to a
    // permanent identified user — every existing profiles/user_story_views
    // row (keyed on that uid) carries over untouched, no data migration.
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) {
      setErrorMessage(error.message);
      setStatus("error");
      return;
    }
    // Defer the actual handle claim until the email is confirmed — writing
    // it to the unique profiles.handle column now (while still anonymous)
    // would let anyone squat a desirable handle by entering an email they
    // never confirm. Stash it locally; app/index.tsx picks it up and calls
    // completePendingHandleClaim once supabase.auth.getUser() shows
    // email_confirmed_at is actually set (checked on every app open, so
    // this also survives the confirmation happening out-of-band).
    await savePendingHandle(trimmedHandle);
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <View style={{ padding: 16, backgroundColor: colors.background, flex: 1, alignItems: "center", gap: 12, paddingTop: 64 }}>
        <Ionicons name="mail-outline" size={40} color={colors.primary} />
        <Text style={{ fontSize: 16, fontFamily: fonts.headline, color: colors.textPrimary }}>
          Check your email
        </Text>
        <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary, textAlign: "center" }}>
          Tap the confirmation link we sent to {email.trim()}, then reopen Sourced. Your streak,
          reading history, and new handle carry over exactly as they are.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16, backgroundColor: colors.background, flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
        <Text style={{ fontSize: 16, fontFamily: fonts.headline, color: colors.textPrimary }}>
          Save your progress
        </Text>
      </View>
      <Text style={{ marginTop: 8, fontFamily: fonts.ui, color: colors.textSecondary }}>
        Add an email so your streak and reading history aren't lost if you reinstall, and pick a
        handle so you can share lists and your profile publicly.
      </Text>
      <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 4 }}>
        <Ionicons name="mail-outline" size={16} color={colors.textSecondary} style={{ marginLeft: 12 }} />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ flex: 1, padding: 12, fontFamily: fonts.ui, color: colors.textPrimary }}
        />
      </View>
      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 4 }}>
        <Ionicons name="at-outline" size={16} color={colors.textSecondary} style={{ marginLeft: 12 }} />
        <TextInput
          value={handle}
          onChangeText={setHandle}
          placeholder="handle (lowercase, 3-20 chars)"
          autoCapitalize="none"
          style={{ flex: 1, padding: 12, fontFamily: fonts.ui, color: colors.textPrimary }}
        />
      </View>
      {status === "error" ? (
        <View style={{ flexDirection: "row", gap: 4, marginTop: 8, alignItems: "flex-start" }}>
          <Ionicons name="warning" size={13} color={colors.red} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontFamily: fonts.ui, color: colors.red }}>
            Couldn't save that: {errorMessage}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", marginTop: 16, gap: 12 }}>
        <Button
          label="Send confirmation link"
          onPress={handleSubmit}
          loading={status === "submitting"}
          style={{ flex: 1 }}
        />
        <Button label="Maybe later" onPress={() => router.back()} variant="secondary" />
      </View>
    </View>
  );
}
