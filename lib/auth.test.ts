import { ensureAnonymousSession } from "./auth";

function makeMockSupabase(opts: {
  existingSession?: { user: { id: string } } | null;
  signInResult?: { user: { id: string } | null };
  getSessionError?: { message: string };
  signInError?: { message: string };
}) {
  const getSession = jest.fn().mockResolvedValue({
    data: { session: opts.existingSession ?? null },
    error: opts.getSessionError ?? null,
  });
  const signInAnonymously = jest.fn().mockResolvedValue({
    data: opts.signInResult ?? { user: null },
    error: opts.signInError ?? null,
  });
  return { client: { auth: { getSession, signInAnonymously } } as any, getSession, signInAnonymously };
}

describe("ensureAnonymousSession", () => {
  it("returns the existing session's user id without signing in again", async () => {
    const { client, signInAnonymously } = makeMockSupabase({
      existingSession: { user: { id: "existing-user" } },
    });
    const userId = await ensureAnonymousSession(client);
    expect(userId).toBe("existing-user");
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when there is no existing session", async () => {
    const { client } = makeMockSupabase({
      existingSession: null,
      signInResult: { user: { id: "new-anon-user" } },
    });
    const userId = await ensureAnonymousSession(client);
    expect(userId).toBe("new-anon-user");
  });

  it("throws when checking for a session fails", async () => {
    const { client } = makeMockSupabase({ getSessionError: { message: "boom" } });
    await expect(ensureAnonymousSession(client)).rejects.toThrow("Failed to check session: boom");
  });

  it("throws when anonymous sign-in fails", async () => {
    const { client } = makeMockSupabase({ existingSession: null, signInError: { message: "boom" } });
    await expect(ensureAnonymousSession(client)).rejects.toThrow(
      "Failed to sign in anonymously: boom"
    );
  });

  it("throws when anonymous sign-in returns no user", async () => {
    const { client } = makeMockSupabase({ existingSession: null, signInResult: { user: null } });
    await expect(ensureAnonymousSession(client)).rejects.toThrow(
      "Anonymous sign-in returned no user"
    );
  });
});
