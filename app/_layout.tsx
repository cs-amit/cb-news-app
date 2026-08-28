import { Stack } from "expo-router";

export default function RootLayout() {
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
