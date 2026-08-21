import * as Notifications from "expo-notifications";

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
// backend exists or is planned), and a one-shot local notification
// rescheduled with fresh content on every app open (see Task 9) delivers
// the spec's "different content per day" requirement without any of that
// infrastructure.
export async function scheduleDailyDigest(
  content: { title: string; body: string },
  hour: number,
  now: Date = new Date()
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextTriggerDate(now, hour),
    },
  });
}
