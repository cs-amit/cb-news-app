import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { isValidHandle, savePendingHandle } from "../lib/handle";

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
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Check your email</Text>
        <Text style={{ marginTop: 8, color: "#555" }}>
          Tap the confirmation link we sent to {email.trim()}, then reopen Sourced. Your streak,
          reading history, and new handle carry over exactly as they are.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "600" }}>Save your progress</Text>
      <Text style={{ marginTop: 8, color: "#555" }}>
        Add an email so your streak and reading history aren't lost if you reinstall, and pick a
        handle so you can share lists and your profile publicly.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ marginTop: 16, borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 12 }}
      />
      <TextInput
        value={handle}
        onChangeText={setHandle}
        placeholder="handle (lowercase, 3-20 chars)"
        autoCapitalize="none"
        style={{ marginTop: 12, borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 12 }}
      />
      {status === "error" ? (
        <Text style={{ marginTop: 8, color: "#a00" }}>Couldn't save that: {errorMessage}</Text>
      ) : null}
      <View style={{ flexDirection: "row", marginTop: 16, gap: 16 }}>
        <Pressable onPress={handleSubmit} disabled={status === "submitting"}>
          <Text style={{ color: "#0066cc", fontWeight: "600" }}>
            {status === "submitting" ? "Sending..." : "Send confirmation link"}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#777" }}>Maybe later</Text>
        </Pressable>
      </View>
    </View>
  );
}
