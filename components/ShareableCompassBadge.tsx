import { useRef, useState, ElementRef } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { CompassGauge } from "./CompassGauge";
import { buildShareDialogTitle } from "../lib/shareBadge";
import { colors, fonts } from "../lib/theme";

/**
 * Renders the badge inside a capturable frame plus a Share button. This is
 * the Hook Model's external-trigger surface: a friend sees this shared
 * image, not a link, and that's what's meant to prompt them to install the
 * app rather than the quiz being the only way in.
 *
 * Capture + native share sheet (react-native-view-shot / expo-sharing) are
 * both native modules -- untestable outside a real device, so this
 * component is intentionally thin glue around lib/shareBadge.ts's one
 * pure, tested piece (the dialog title).
 */
export function ShareableCompassBadge({ handle, position }: { handle: string; position: number }) {
  const shotRef = useRef<ElementRef<typeof ViewShot>>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  async function handleShare() {
    setShareError(null);
    setSharing(true);
    try {
      const uri = await shotRef.current?.capture?.();
      if (!uri) throw new Error("Couldn't capture the badge image.");
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing isn't available on this device.");
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: buildShareDialogTitle(handle) });
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Couldn't share the badge.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <View>
      <ViewShot
        ref={shotRef}
        options={{ format: "png", quality: 1 }}
        style={{ backgroundColor: colors.background, padding: 16, borderRadius: 12 }}
      >
        <Text style={{ fontFamily: fonts.headline, fontSize: 16, color: colors.textPrimary }}>
          {buildShareDialogTitle(handle)}
        </Text>
        <View style={{ marginTop: 10 }}>
          <CompassGauge position={position} />
        </View>
      </ViewShot>
      <Pressable
        onPress={handleShare}
        disabled={sharing}
        style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Ionicons name="share-social-outline" size={14} color={colors.primary} />
        <Text style={{ fontFamily: fonts.ui, color: colors.primary }}>
          {sharing ? "Preparing…" : "Share my badge"}
        </Text>
      </Pressable>
      {shareError ? (
        <Text style={{ marginTop: 4, fontSize: 12, color: colors.red, fontFamily: fonts.ui }}>{shareError}</Text>
      ) : null}
    </View>
  );
}
