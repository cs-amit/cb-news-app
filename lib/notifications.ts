import * as Notifications from "expo-notifications";

// Without a handler, a notification that arrives while the app is in the
// foreground is not displayed at all (Expo's default behavior) — directly
// demo-relevant, since tapping "Turn on" would otherwise appear to do
// nothing if the digest ever fired while the app was open. Registered at
// module scope so it runs once on import, matching how lib/supabase.ts's
// AppState.addEventListener already runs at module scope in this codebase.
// Field names match the currently-installed expo-notifications'
// NotificationBehavior shape (node_modules/expo-notifications/build/
// Notifications.types.d.ts): shouldShowBanner/shouldShowList are the
// current required fields — shouldShowAlert (used in older docs/examples)
// is deprecated in this version and was deliberately not used here.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Pure and local-time-based, so it's testable without a device. Note: this
// uses the JS Date object's local-timezone getters/setters deliberately —
// "9am" should mean 9am on the reader's device, not 9am UTC.
export function nextTriggerDate(now: Date, hour: number): Date {
  const trigger = new Date(now.getTime());
  trigger.setHours(hour, 0, 0, 0);
  if (trigger.getTime() <= now.getTime()) {
    trigger.setDate(trigger.getDate() + 1);
  }
  return trigger;
}

export async function ensureAndroidChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync("daily-digest", {
    name: "Daily digest",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// Local, on-device notification — deliberately not a server-pushed one.
// Expo Go on Android has not supported remote push since SDK 53, this
// project's only distribution channel is a sideloaded APK (no push-token
// backend exists or is planned), and a recurring local notification
// rescheduled with fresh content on every app open (see Task 9) delivers
// the spec's "different content per day" requirement without any of that
// infrastructure.
//
// Uses a DAILY (not one-shot DATE) trigger: a one-shot trigger fires once
// and then never again unless the app happens to be reopened, which is the
// only reschedule path — a user who ignores one notification would never
// get another. A DAILY trigger keeps firing every day at `hour` with
// whatever content was last scheduled here, while app-open still refreshes
// the content by cancelling and rescheduling (unchanged).
//
// ensureAndroidChannel() is called here (not just from the one opt-in call
// site) and channelId is passed on the trigger so every code path that
// schedules a notification actually lands it on the "daily-digest" channel
// — without channelId the notification lands on Android's default channel
// and the channel's own settings toggle controls nothing.
export async function scheduleDailyDigest(
  content: { title: string; body: string },
  hour: number
): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
      channelId: "daily-digest",
    },
  });
}
