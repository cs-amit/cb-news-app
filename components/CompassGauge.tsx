import { View, Text } from "react-native";
import { colors, fonts, pollColors } from "../lib/theme";
import { CompassDistribution } from "../lib/compassStats";

const MARKER_SIZE = 16;

/**
 * Horizontal -100..+100 gauge with three colored zones (reusing the same
 * critical/balanced/friendly palette as the poll pills) and a marker at the
 * user's position — replaces the old bare "Compass position: 42" text.
 */
export function CompassGauge({ position }: { position: number }) {
  const clamped = Math.max(-100, Math.min(100, position));
  const markerPercent = ((clamped + 100) / 200) * 100;

  return (
    <View>
      <View style={{ position: "relative" }}>
        <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden" }}>
          <View style={{ flex: 1, backgroundColor: pollColors.critical }} />
          <View style={{ flex: 1, backgroundColor: pollColors.balanced }} />
          <View style={{ flex: 1, backgroundColor: pollColors.friendly }} />
        </View>
        <View
          style={{
            position: "absolute",
            left: `${markerPercent}%`,
            top: -3,
            width: MARKER_SIZE,
            height: MARKER_SIZE,
            marginLeft: -(MARKER_SIZE / 2),
            borderRadius: MARKER_SIZE / 2,
            backgroundColor: colors.background,
            borderWidth: 3,
            borderColor: colors.textPrimary,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui }}>Critical</Text>
        <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui }}>Balanced</Text>
        <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui }}>Friendly</Text>
      </View>
    </View>
  );
}

/** Stacked bar showing the split of the user's own poll answers by type. */
export function CompassDistributionBar({ distribution }: { distribution: CompassDistribution }) {
  if (distribution.total === 0) return null;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden" }}>
        {distribution.critical > 0 ? (
          <View style={{ flex: distribution.critical, backgroundColor: pollColors.critical }} />
        ) : null}
        {distribution.balanced > 0 ? (
          <View style={{ flex: distribution.balanced, backgroundColor: pollColors.balanced }} />
        ) : null}
        {distribution.friendly > 0 ? (
          <View style={{ flex: distribution.friendly, backgroundColor: pollColors.friendly }} />
        ) : null}
      </View>
      <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fonts.ui, marginTop: 4 }}>
        Based on {distribution.total} poll answer{distribution.total === 1 ? "" : "s"}: {distribution.critical}%
        critical · {distribution.balanced}% balanced · {distribution.friendly}% friendly
      </Text>
    </View>
  );
}
