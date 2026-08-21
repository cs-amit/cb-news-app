import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function UpgradeScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit() {
    if (!email.trim()) return;
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
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Check your email</Text>
        <Text style={{ marginTop: 8, color: "#555" }}>
          Tap the confirmation link we sent to {email.trim()}, then reopen Sourced. Your streak
          and reading history carry over exactly as they are.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "600" }}>Save your progress</Text>
      <Text style={{ marginTop: 8, color: "#555" }}>
        Add an email so your streak and reading history aren't lost if you reinstall. Nothing
        else changes — no password needed right now.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ marginTop: 16, borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 12 }}
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
