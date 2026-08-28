import AsyncStorage from "@react-native-async-storage/async-storage";
import { isValidHandle, savePendingHandle, readPendingHandle, clearPendingHandle } from "./handle";

describe("isValidHandle", () => {
  it("accepts lowercase letters, digits, and underscore within length bounds", () => {
    expect(isValidHandle("amit_57")).toBe(true);
    expect(isValidHandle("abc")).toBe(true);
    expect(isValidHandle("a".repeat(20))).toBe(true);
  });

  it("rejects too short or too long handles", () => {
    expect(isValidHandle("ab")).toBe(false);
    expect(isValidHandle("a".repeat(21))).toBe(false);
  });

  it("rejects uppercase, spaces, and symbols other than underscore", () => {
    expect(isValidHandle("Amit57")).toBe(false);
    expect(isValidHandle("amit 57")).toBe(false);
    expect(isValidHandle("amit-57")).toBe(false);
    expect(isValidHandle("amit@57")).toBe(false);
  });
});

describe("pending handle storage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns null when no handle has been saved", async () => {
    expect(await readPendingHandle()).toBeNull();
  });

  it("saves a handle and reads it back", async () => {
    await savePendingHandle("amit_57");
    expect(await readPendingHandle()).toBe("amit_57");
  });

  it("overwrites a previously saved handle", async () => {
    await savePendingHandle("first_handle");
    await savePendingHandle("second_handle");
    expect(await readPendingHandle()).toBe("second_handle");
  });

  it("clears a saved handle so it no longer reads back", async () => {
    await savePendingHandle("amit_57");
    await clearPendingHandle();
    expect(await readPendingHandle()).toBeNull();
  });

  it("clearing when nothing is saved is a no-op, not an error", async () => {
    await expect(clearPendingHandle()).resolves.toBeUndefined();
    expect(await readPendingHandle()).toBeNull();
  });
});
