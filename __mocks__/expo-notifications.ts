// Manual Jest mock for expo-notifications. Jest auto-applies any
// <rootDir>/__mocks__/<node_module_name> file for node_modules packages
// (no jest.mock() call needed in test files). This exists purely so
// lib/notifications.ts can be imported under Jest: the real package ships
// ESM that ts-jest doesn't transform (it only transforms project files,
// not node_modules), and lib/notifications.test.ts only exercises the
// pure nextTriggerDate function anyway — these exports are never invoked
// by the current test suite, just present so the module resolves.
export enum AndroidImportance {
  UNKNOWN = 0,
  UNSPECIFIED = 1,
  NONE = 2,
  MIN = 3,
  LOW = 4,
  DEFAULT = 5,
  HIGH = 6,
  MAX = 7,
}

export enum SchedulableTriggerInputTypes {
  DATE = "date",
  DAILY = "daily",
}

export const setNotificationHandler = jest.fn();
export const setNotificationChannelAsync = jest.fn();
export const requestPermissionsAsync = jest.fn(async () => ({ status: "granted" }));
export const cancelAllScheduledNotificationsAsync = jest.fn();
export const scheduleNotificationAsync = jest.fn();
