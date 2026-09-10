import { useLocalSearchParams } from "expo-router";
import { ProfileScreenBody } from "../../components/ProfileScreenBody";

export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  if (!handle) return null;
  return <ProfileScreenBody handle={handle} />;
}
