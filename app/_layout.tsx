import { Stack } from "expo-router";
import { useFonts, SourceSerif4_700Bold } from "@expo-google-fonts/source-serif-4";
import { Sora_400Regular, Sora_600SemiBold } from "@expo-google-fonts/sora";
import { ActivityIndicator, View } from "react-native";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SourceSerif4_700Bold,
    Sora_400Regular,
    Sora_600SemiBold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Today's Stories" }} />
      <Stack.Screen name="story/[id]" options={{ title: "Story" }} />
      <Stack.Screen name="methodology" options={{ title: "Methodology" }} />
      <Stack.Screen name="upgrade" options={{ title: "Save your progress" }} />
      <Stack.Screen name="quiz" options={{ title: "Where do you stand?" }} />
      <Stack.Screen name="profile/[handle]" options={{ title: "Profile" }} />
      <Stack.Screen name="list/[id]" options={{ title: "List" }} />
    </Stack>
  );
}
