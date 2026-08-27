import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/auth";
import { isValidHandle } from "../lib/handle";
import { claimHandle, createDefaultRepostsList } from "../lib/queries";

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
    try {
      const userId = await getUserId(supabase);
      await claimHandle(supabase, userId, trimmedHandle);
      await createDefaultRepostsList(supabase, userId);
    } catch (err) {
      // The email confirmation already sent successfully — a handle/list
      // hiccup here must not block the user from finishing email
      // confirmation. They can pick a handle again from their profile.
      console.error("Failed to claim handle after upgrade:", err);
    }
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
