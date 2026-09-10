import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getUserId } from "../../lib/auth";
import { fetchProfile } from "../../lib/queries";
import { ProfileScreenBody } from "../../components/ProfileScreenBody";
import { Button } from "../../components/Button";
import { colors, fonts } from "../../lib/theme";

/**
 * The Profile tab is always "you" -- unlike app/profile/[handle].tsx (which
 * can show anyone's public profile), this resolves your own handle first.
 * A handle only exists once you've been through the upgrade flow (see
 * app/upgrade.tsx); until then there's nothing to show at /profile/<handle>,
 * so this renders a prompt instead of a broken/empty profile screen.
 */
export default function ProfileTabScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ownHandle, setOwnHandle] = useState<string | null>(null);

  useEffect(() => {
    getUserId(supabase)
      .then(async (id) => {
        const profile = await fetchProfile(supabase, id);
        setOwnHandle(profile?.handle ?? null);
      })
      .catch((err) => console.error("Failed to resolve own profile:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} />;

  if (!ownHandle) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          gap: 12,
          backgroundColor: colors.background,
        }}
      >
        <Ionicons name="person-circle-outline" size={40} color={colors.textSecondary} />
        <Text style={{ fontFamily: fonts.headline, fontSize: 18, color: colors.textPrimary, textAlign: "center" }}>
          No profile yet
        </Text>
        <Text style={{ fontFamily: fonts.ui, color: colors.textSecondary, textAlign: "center" }}>
          Add an email and pick a handle to get a public profile, save your streak, and share lists.
        </Text>
        <Button label="Set up my profile" onPress={() => router.push("/upgrade")} />
      </View>
    );
  }

  return <ProfileScreenBody handle={ownHandle} />;
}
