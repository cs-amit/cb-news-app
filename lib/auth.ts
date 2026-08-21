import { SupabaseClient } from "@supabase/supabase-js";

export async function ensureAnonymousSession(supabase: SupabaseClient): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Failed to check session: ${sessionError.message}`);
  if (sessionData.session) {
    // A confirmed-email upgrade (Task 10) can complete out-of-band (the
    // user taps a link in their email client, not inside this app). This
    // refresh is a best-effort pickup of that change on next app open —
    // never fatal, since the existing session is still perfectly usable
    // either way.
    try {
      await supabase.auth.refreshSession();
    } catch {
      // best-effort; ignore
    }
    return sessionData.session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`Failed to sign in anonymously: ${error.message}`);
  if (!data.user) throw new Error("Anonymous sign-in returned no user");
  return data.user.id;
}

let cachedUserId: Promise<string> | null = null;

// Memoized so every screen can call this cheaply without re-hitting
// getSession() on every render — one bootstrap per app lifetime. A failed
// bootstrap (e.g. transient network error at cold start) clears the cache
// so the next call can retry instead of every screen inheriting the same
// stale rejection for the rest of the process lifetime.
export function getUserId(supabase: SupabaseClient): Promise<string> {
  if (!cachedUserId) {
    cachedUserId = ensureAnonymousSession(supabase).catch((err) => {
      cachedUserId = null;
      throw err;
    });
  }
  return cachedUserId;
}
