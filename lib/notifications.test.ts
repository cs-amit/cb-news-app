import { nextTriggerDate } from "./notifications";

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
