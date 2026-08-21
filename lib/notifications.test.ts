import * as Notifications from "expo-notifications";
import { nextTriggerDate, scheduleDailyDigest } from "./notifications";

describe("nextTriggerDate", () => {
  it("schedules for later today when the hour hasn't passed yet", () => {
    const now = new Date("2026-08-21T07:00:00Z");
    const result = nextTriggerDate(now, 9);
    expect(result.toISOString().slice(0, 16)).toBe("2026-08-21T09:00");
  });

  it("schedules for tomorrow when the hour has already passed today", () => {
    const now = new Date("2026-08-21T10:00:00Z");
    const result = nextTriggerDate(now, 9);
    expect(result.toISOString().slice(0, 16)).toBe("2026-08-22T09:00");
  });

  it("schedules for tomorrow when it is exactly the trigger hour", () => {
    const now = new Date("2026-08-21T09:00:00Z");
    const result = nextTriggerDate(now, 9);
    expect(result.toISOString().slice(0, 16)).toBe("2026-08-22T09:00");
  });
});

describe("scheduleDailyDigest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("schedules a recurring DAILY trigger on the daily-digest channel", async () => {
    await scheduleDailyDigest({ title: "Today's story", body: "Body text" }, 9);

    // Regression for the Important findings: a one-shot DATE trigger never
    // fires again if ignored, and without channelId the notification landed
    // on Android's default channel instead of "daily-digest".
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: "Today's story", body: "Body text" },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
        channelId: "daily-digest",
      },
    });
  });

  it("ensures the Android channel exists on every schedule call, not just the opt-in call site", async () => {
    await scheduleDailyDigest({ title: "T", body: "B" }, 9);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      "daily-digest",
      expect.objectContaining({ name: "Daily digest" })
    );
  });

  it("cancels any previously scheduled notification before scheduling the new one", async () => {
    await scheduleDailyDigest({ title: "T", body: "B" }, 9);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });
});
