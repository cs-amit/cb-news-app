import AsyncStorage from "@react-native-async-storage/async-storage";

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

// Key for the locally-stashed handle a user picked during the upgrade flow
// (app/upgrade.tsx), claimed only after their email is actually confirmed —
// see app/index.tsx's profile-loading effect for the pickup logic and
// docs/superpowers/specs/2026-08-26-social-layer-design.md §1 for why the
// claim is deferred (no handle-squatting before proof of email ownership).
const PENDING_HANDLE_KEY = "pendingHandleClaim";

export async function savePendingHandle(handle: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_HANDLE_KEY, handle);
}

export async function readPendingHandle(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_HANDLE_KEY);
}

export async function clearPendingHandle(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_HANDLE_KEY);
}
