import { fetchRecentStories, fetchSilentOutlets, fetchMethodologyStats, fetchStoryWithArticles } from "./queries";
import { fetchConflictFlags, fetchFactChecks, fetchDiscoveredArticles } from "./queries";
import { recordArticleView, fetchProfile, recomputeAndSaveStreak } from "./queries";
import { submitPollResponse, fetchPollTally, fetchPollTallies } from "./queries";
import { applyPollDrift, fetchOwnPollResponses, fetchOwnCompassStats } from "./queries";
import {
  claimHandle,
  completePendingHandleClaim,
  recoverPendingHandleClaim,
  setCompassPosition,
  fetchPublicProfile,
  fetchListById,
  fetchDiscoverableProfiles,
} from "./queries";
import {
  createDefaultRepostsList,
  createList,
  fetchUserLists,
  fetchPublicLists,
  fetchListItems,
  addStoryToList,
  removeStoryFromList,
  toggleListPublic,
  reorderListItems,
} from "./queries";

function makeMockSupabase(result: { data: any; error: any }) {
  const limit = jest.fn().mockResolvedValue(result);
  const order = jest.fn().mockReturnValue({ limit });
  const eq = jest.fn().mockReturnValue({ order });
  const not = jest.fn().mockReturnValue({ order, eq });
  const select = jest.fn().mockReturnValue({ not });
  const from = jest.fn().mockReturnValue({ select });
  return { client: { from } as any, from, select, not, eq, order, limit };
}

describe("fetchRecentStories", () => {
  // The Compare tab used to starve: the shared query pulled only the
  // newest 50 stories overall, then the feed screen filtered client-side --
  // so Compare showed whatever tiny fraction of that small, mostly-fresh
  // slice happened to already be multi-source. Filtering server-side per
  // view, with Compare given a much bigger backing pool, means Compare
  // surfaces real multi-source stories even when they're not brand new
  // (staleness is an accepted trade-off here, not a bug).
  interface Call {
    method: string;
    args: any[];
  }
  function makeFlexMockSupabase(result: { data: any; error: any }) {
    const calls: Call[] = [];
    const builder: any = {};
    for (const method of ["select", "not", "eq", "gte", "lt", "order", "limit"]) {
      builder[method] = (...args: any[]) => {
        calls.push({ method, args });
        return builder;
      };
    }
    builder.then = (onFulfilled: any) => Promise.resolve(result).then(onFulfilled);
    const from = jest.fn().mockReturnValue(builder);
    return { client: { from } as any, from, calls };
  }
  function callArgs(calls: Call[], method: string) {
    return calls.find((c) => c.method === method)?.args;
  }

  it("returns the story list on success", async () => {
    const stories = [
      {
        id: "1",
        canonical_headline: "H",
        summary: "S",
        first_seen_at: "2026-08-01T00:00:00Z",
        article_count: 3,
      },
    ];
    const { client, from } = makeFlexMockSupabase({ data: stories, error: null });
    const result = await fetchRecentStories(client);
    expect(from).toHaveBeenCalledWith("stories");
    expect(result).toEqual(stories);
  });

  it("excludes stories that have no headline yet", async () => {
    const { client, calls } = makeFlexMockSupabase({ data: [], error: null });
    await fetchRecentStories(client);
    expect(callArgs(calls, "not")).toEqual(["canonical_headline", "is", null]);
    expect(callArgs(calls, "order")).toEqual(["first_seen_at", { ascending: false }]);
  });

  it("defaults to the compare view: article_count >= 2, a much larger limit", async () => {
    const { client, calls } = makeFlexMockSupabase({ data: [], error: null });
    await fetchRecentStories(client);
    expect(callArgs(calls, "gte")).toEqual(["article_count", 2]);
    expect(callArgs(calls, "lt")).toBeUndefined();
    expect(callArgs(calls, "limit")?.[0]).toBeGreaterThanOrEqual(200);
  });

  it("the single-source view filters article_count < 2 with the old, smaller limit", async () => {
    const { client, calls } = makeFlexMockSupabase({ data: [], error: null });
    await fetchRecentStories(client, undefined, "single");
    expect(callArgs(calls, "lt")).toEqual(["article_count", 2]);
    expect(callArgs(calls, "gte")).toBeUndefined();
    expect(callArgs(calls, "limit")).toEqual([50]);
  });

  it("returns an empty array when data is null", async () => {
    const { client } = makeFlexMockSupabase({ data: null, error: null });
    expect(await fetchRecentStories(client)).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeFlexMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchRecentStories(client)).rejects.toThrow("Failed to fetch stories: boom");
  });

  it("filters by topic when a topic is provided", async () => {
    const { client, calls } = makeFlexMockSupabase({ data: [], error: null });
    await fetchRecentStories(client, "politics");
    expect(callArgs(calls, "eq")).toEqual(["topic", "politics"]);
  });

  it("does not filter by topic when none is provided", async () => {
    const { client, calls } = makeFlexMockSupabase({ data: [], error: null });
    await fetchRecentStories(client);
    expect(callArgs(calls, "eq")).toBeUndefined();
  });
});

describe("fetchSilentOutlets", () => {
  interface Call {
    method: string;
    args: any[];
  }
  interface Query {
    table: string;
    calls: Call[];
  }
  const CHAIN_METHODS = ["select", "gte", "eq", "in", "order", "range"];

  /**
   * Chain-recording mock: the active-outlet scan is now paginated, so the two
   * `articles` queries have to be told apart by their chain (the scan calls
   * `.range()`, the covering-articles query calls `.eq("story_id", ...)`).
   */
  function makeMockSupabase(resolve: (q: Query) => { data: any; error: any }) {
    const queries: Query[] = [];
    const from = jest.fn((table: string) => {
      const query: Query = { table, calls: [] };
      queries.push(query);
      const builder: any = {};
      for (const method of CHAIN_METHODS) {
        builder[method] = (...args: any[]) => {
          query.calls.push({ method, args });
          return builder;
        };
      }
      builder.then = (onFulfilled: any) => Promise.resolve(resolve(query)).then(onFulfilled);
      return builder;
    });
    return { client: { from } as any, queries };
  }

  const isActiveScan = (q: Query) => q.calls.some((c) => c.method === "range");
  const rangeOffset = (q: Query) => q.calls.find((c) => c.method === "range")!.args[0];
  const oldFirstSeen = () => new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  it("returns outlets that are active but not covering, past the lag guard", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "outlets") {
        return {
          data: [
            { id: "o1", name: "A", is_youtube: false },
            { id: "o2", name: "B", is_youtube: false },
          ],
          error: null,
        };
      }
      // Active scan: both outlets published recently.
      if (isActiveScan(q)) return { data: [{ outlet_id: "o1" }, { outlet_id: "o2" }], error: null };
      // Covering this story: only o1.
      return { data: [{ outlet_id: "o1" }], error: null };
    });

    const result = await fetchSilentOutlets(client, "story-1", oldFirstSeen());

    expect(result.map((o) => o.id)).toEqual(["o2"]);
    // Outlets are fetched exactly once, up front — no second `.in("id", ...)` lookup.
    expect(queries.filter((q) => q.table === "outlets")).toHaveLength(1);
    expect(queries[0].table).toBe("outlets");
  });

  it("orders the active-outlet scan deterministically, matching the clusterStories/flagStoryConflicts tiebreaker pattern", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "outlets") {
        return { data: [{ id: "o1", name: "A", is_youtube: false }], error: null };
      }
      if (isActiveScan(q)) return { data: [{ outlet_id: "o1" }], error: null };
      return { data: [], error: null };
    });

    await fetchSilentOutlets(client, "story-1", oldFirstSeen());

    const scanQuery = queries.find((q) => q.table === "articles" && isActiveScan(q))!;
    const orderCalls = scanQuery.calls.filter((c) => c.method === "order").map((c) => c.args);
    expect(orderCalls).toEqual([
      ["created_at", { ascending: false }],
      ["id"],
    ]);
  });

  it("returns an empty array when no outlet has published recently", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "outlets") {
        return { data: [{ id: "o1", name: "A", is_youtube: false }], error: null };
      }
      return { data: [], error: null };
    });

    const result = await fetchSilentOutlets(client, "story-1", oldFirstSeen());
    expect(result).toEqual([]);
  });

  it("returns an empty array when there are no outlets at all", async () => {
    const { client, queries } = makeMockSupabase(() => ({ data: [], error: null }));
    const result = await fetchSilentOutlets(client, "story-1", oldFirstSeen());
    expect(result).toEqual([]);
    // Nothing can be silent if no outlets exist — don't scan articles at all.
    expect(queries.filter((q) => q.table === "articles")).toHaveLength(0);
  });

  it("stops scanning articles once every known outlet has been seen active", async () => {
    const ACTIVE_PAGE_SIZE = 500;
    // A full first page (so a naive loop would fetch page 2) in which both of
    // the two known outlets already appear.
    const fullFirstPage = Array.from({ length: ACTIVE_PAGE_SIZE }, (_, i) => ({
      outlet_id: i % 2 === 0 ? "o1" : "o2",
    }));

    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "outlets") {
        return {
          data: [
            { id: "o1", name: "A", is_youtube: false },
            { id: "o2", name: "B", is_youtube: false },
          ],
          error: null,
        };
      }
      if (isActiveScan(q)) {
        return { data: rangeOffset(q) === 0 ? fullFirstPage : [{ outlet_id: "o1" }], error: null };
      }
      return { data: [{ outlet_id: "o1" }], error: null };
    });

    const result = await fetchSilentOutlets(client, "story-1", oldFirstSeen());

    expect(result.map((o) => o.id)).toEqual(["o2"]);
    // The early exit is the point: one page, not a full trailing-window scan.
    expect(queries.filter((q) => q.table === "articles" && isActiveScan(q))).toHaveLength(1);
  });

  it("warns but does not throw when the active scan hits the safety ceiling", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // Two outlets known, but only one ever publishes — so the early exit never
    // fires and only the ceiling stops the loop.
    const fullPage = Array.from({ length: 500 }, () => ({ outlet_id: "o1" }));

    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "outlets") {
        return {
          data: [
            { id: "o1", name: "A", is_youtube: false },
            { id: "o2", name: "B", is_youtube: false },
          ],
          error: null,
        };
      }
      if (isActiveScan(q)) return { data: fullPage, error: null };
      return { data: [], error: null };
    });

    const result = await fetchSilentOutlets(client, "story-1", oldFirstSeen());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("safety ceiling"));
    // 5000-row ceiling / 500-row pages: stops after 10 pages rather than looping forever.
    expect(queries.filter((q) => q.table === "articles" && isActiveScan(q))).toHaveLength(10);
    expect(result.map((o) => o.id)).toEqual(["o1"]);
    warnSpy.mockRestore();
  });
});

describe("fetchMethodologyStats", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const select = jest.fn().mockResolvedValue(result);
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any };
  }

  it("aggregates outlet and youtube counts and the latest scoring date", async () => {
    const { client } = makeMockSupabase({
      data: [
        { is_youtube: false, govt_lean_updated_at: "2026-08-18T00:00:00Z" },
        { is_youtube: false, govt_lean_updated_at: null },
        { is_youtube: true, govt_lean_updated_at: "2026-08-19T00:00:00Z" },
      ],
      error: null,
    });
    const stats = await fetchMethodologyStats(client);
    expect(stats).toEqual({
      outletCount: 2,
      youtubeCount: 1,
      scoredOutletCount: 2,
      lastScoredAt: "2026-08-19T00:00:00Z",
    });
  });

  it("returns zeroes/null when there is no data", async () => {
    const { client } = makeMockSupabase({ data: null, error: null });
    const stats = await fetchMethodologyStats(client);
    expect(stats).toEqual({ outletCount: 0, youtubeCount: 0, scoredOutletCount: 0, lastScoredAt: null });
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchMethodologyStats(client)).rejects.toThrow(
      "Failed to fetch methodology stats: boom"
    );
  });
});

describe("fetchConflictFlags", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const eq = jest.fn().mockResolvedValue(result);
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from };
  }

  it("returns the story's conflict flags", async () => {
    const flags = [{ outlet_id: "o1", matched_entity: "Reliance", evidence_text: "Reliance Jio..." }];
    const { client, from } = makeMockSupabase({ data: flags, error: null });
    const result = await fetchConflictFlags(client, "story-1");
    expect(from).toHaveBeenCalledWith("story_conflict_flags");
    expect(result).toEqual(flags);
  });

  it("returns an empty array when data is null", async () => {
    const { client } = makeMockSupabase({ data: null, error: null });
    expect(await fetchConflictFlags(client, "story-1")).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchConflictFlags(client, "story-1")).rejects.toThrow(
      "Failed to fetch conflict flags: boom"
    );
  });
});

describe("fetchFactChecks", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const eq = jest.fn().mockResolvedValue(result);
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from };
  }

  it("returns the story's fact-checks", async () => {
    const factChecks = [
      { source_org: "Alt News", claim: "Viral claim about vaccine", verdict: "False", url: "https://altnews.in/x" },
    ];
    const { client, from } = makeMockSupabase({ data: factChecks, error: null });
    const result = await fetchFactChecks(client, "story-1");
    expect(from).toHaveBeenCalledWith("fact_checks");
    expect(result).toEqual(factChecks);
  });

  it("returns an empty array when data is null", async () => {
    const { client } = makeMockSupabase({ data: null, error: null });
    expect(await fetchFactChecks(client, "story-1")).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchFactChecks(client, "story-1")).rejects.toThrow(
      "Failed to fetch fact-checks: boom"
    );
  });
});

describe("fetchStoryWithArticles", () => {
  it("throws a friendly error without querying when the id isn't a valid uuid (bad link/typo)", async () => {
    const from = jest.fn();
    const client = { from } as any;
    await expect(fetchStoryWithArticles(client, "nonexistent")).rejects.toThrow(
      "no story with that id"
    );
    expect(from).not.toHaveBeenCalled();
  });
});

describe("fetchDiscoveredArticles", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const order = jest.fn().mockResolvedValue(result);
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from };
  }

  it("returns the story's discovered articles", async () => {
    const rows = [
      { id: "d1", outlet_name: "Some Outlet", url: "https://example.com/a", title: "T", published_at: null },
    ];
    const { client, from } = makeMockSupabase({ data: rows, error: null });
    const result = await fetchDiscoveredArticles(client, "story-1");
    expect(from).toHaveBeenCalledWith("discovered_articles");
    expect(result).toEqual(rows);
  });

  it("returns an empty array when data is null", async () => {
    const { client } = makeMockSupabase({ data: null, error: null });
    expect(await fetchDiscoveredArticles(client, "story-1")).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchDiscoveredArticles(client, "story-1")).rejects.toThrow(
      "Failed to fetch discovered articles: boom"
    );
  });
});

describe("recordArticleView", () => {
  function makeMockSupabase(result: { error: any }) {
    const upsert = jest.fn().mockResolvedValue(result);
    const from = jest.fn().mockReturnValue({ upsert });
    return { client: { from } as any, upsert, from };
  }

  it("upserts a view row, ignoring duplicates", async () => {
    const { client, upsert, from } = makeMockSupabase({ error: null });
    await recordArticleView(client, "user-1", "story-1", "outlet-1");
    expect(from).toHaveBeenCalledWith("user_story_views");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", story_id: "story-1", outlet_id: "outlet-1" },
      { onConflict: "user_id,story_id,outlet_id", ignoreDuplicates: true }
    );
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ error: { message: "boom" } });
    await expect(recordArticleView(client, "user-1", "story-1", "outlet-1")).rejects.toThrow(
      "Failed to record article view: boom"
    );
  });
});

describe("fetchProfile", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, eq };
  }

  it("returns the profile row", async () => {
    const profile = {
      id: "user-1",
      streak_count: 3,
      longest_streak: 5,
      sides_seen_total: 12,
      notification_opt_in: true,
      notification_hour: 9,
      handle: null,
    };
    const { client, from, eq } = makeMockSupabase({ data: profile, error: null });
    const result = await fetchProfile(client, "user-1");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "user-1");
    expect(result).toEqual(profile);
  });

  it("returns null when no profile row exists yet", async () => {
    const { client } = makeMockSupabase({ data: null, error: null });
    expect(await fetchProfile(client, "user-1")).toBeNull();
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchProfile(client, "user-1")).rejects.toThrow(
      "Failed to fetch profile: boom"
    );
  });
});

describe("recomputeAndSaveStreak", () => {
  interface Call {
    method: string;
    args: any[];
  }
  interface Query {
    table: string;
    calls: Call[];
  }
  const CHAIN_METHODS = ["select", "update", "eq", "gte", "maybeSingle"];

  function makeMockSupabase(resolve: (q: Query) => { data: any; error: any }) {
    const queries: Query[] = [];
    const from = jest.fn((table: string) => {
      const query: Query = { table, calls: [] };
      queries.push(query);
      const builder: any = {};
      for (const method of CHAIN_METHODS) {
        builder[method] = (...args: any[]) => {
          query.calls.push({ method, args });
          return builder;
        };
      }
      builder.then = (onFulfilled: any) => Promise.resolve(resolve(query)).then(onFulfilled);
      return builder;
    });
    return { client: { from } as any, queries };
  }

  it("recomputes streak/sides-seen from view history and saves them, raising longest_streak if beaten", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "user_story_views" && q.calls.some((c) => c.method === "gte")) {
        return {
          data: [
            { story_id: "s1", outlet_id: "a", viewed_at: "2026-08-21T10:00:00Z" },
            { story_id: "s1", outlet_id: "b", viewed_at: "2026-08-21T10:00:00Z" },
          ],
          error: null,
        };
      }
      if (q.table === "profiles" && q.calls.some((c) => c.method === "maybeSingle")) {
        return {
          data: {
            id: "user-1",
            streak_count: 0,
            longest_streak: 2,
            sides_seen_total: 0,
            notification_opt_in: false,
            notification_hour: 9,
          },
          error: null,
        };
      }
      if (q.table === "profiles" && q.calls.some((c) => c.method === "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const computeFn = jest.fn().mockReturnValue(1);
    const result = await recomputeAndSaveStreak(client, "user-1", computeFn);

    // The two view rows share a story_id but have different outlet_ids, so
    // they're 2 distinct (story, outlet) pairs per computeSidesSeenTotal
    // (see lib/streak.ts / lib/streak.test.ts) — sidesSeenTotal is 2, not 1.
    expect(result).toEqual({ streakCount: 1, sidesSeenTotal: 2 });
    const updateQuery = queries.find(
      (q) => q.table === "profiles" && q.calls.some((c) => c.method === "update")
    )!;
    const updateCall = updateQuery.calls.find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ streak_count: 1, longest_streak: 2, sides_seen_total: 2 });
  });

  it("throws when fetching view history fails", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "user_story_views") return { data: null, error: { message: "boom" } };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    await expect(recomputeAndSaveStreak(client, "user-1")).rejects.toThrow(
      "Failed to fetch view history: boom"
    );
  });
});

describe("submitPollResponse", () => {
  function makeMockSupabase(result: { error: any }) {
    const upsert = jest.fn().mockResolvedValue(result);
    const from = jest.fn().mockReturnValue({ upsert });
    return { client: { from } as any, upsert, from };
  }

  it("upserts the response, allowing the user to change their vote", async () => {
    const { client, upsert, from } = makeMockSupabase({ error: null });
    await submitPollResponse(client, "user-1", "story-1", "outlet-1", "balanced");
    expect(from).toHaveBeenCalledWith("outlet_poll_responses");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", story_id: "story-1", outlet_id: "outlet-1", response: "balanced" },
      { onConflict: "user_id,story_id,outlet_id" }
    );
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ error: { message: "boom" } });
    await expect(
      submitPollResponse(client, "user-1", "story-1", "outlet-1", "balanced")
    ).rejects.toThrow("Failed to submit poll response: boom");
  });
});

describe("fetchPollTally", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const eq2 = jest.fn().mockResolvedValue(result);
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const select = jest.fn().mockReturnValue({ eq: eq1 });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from };
  }

  it("returns counts per response option", async () => {
    const { client, from } = makeMockSupabase({
      data: [
        { response: "balanced", response_count: 7 },
        { response: "critical", response_count: 2 },
      ],
      error: null,
    });
    const tally = await fetchPollTally(client, "story-1", "outlet-1");
    expect(from).toHaveBeenCalledWith("outlet_poll_tallies");
    expect(tally).toEqual({ critical: 2, balanced: 7, friendly: 0, total: 9 });
  });

  it("returns all zeroes when there are no responses yet", async () => {
    const { client } = makeMockSupabase({ data: [], error: null });
    const tally = await fetchPollTally(client, "story-1", "outlet-1");
    expect(tally).toEqual({ critical: 0, balanced: 0, friendly: 0, total: 0 });
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchPollTally(client, "story-1", "outlet-1")).rejects.toThrow(
      "Failed to fetch poll tally: boom"
    );
  });
});

describe("fetchPollTallies", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const eq = jest.fn().mockResolvedValue(result);
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, select, eq };
  }

  it("aggregates tallies per outlet across the whole story in one query", async () => {
    const { client, from, eq } = makeMockSupabase({
      data: [
        { outlet_id: "o1", response: "balanced", response_count: 7 },
        { outlet_id: "o1", response: "critical", response_count: 2 },
        { outlet_id: "o2", response: "friendly", response_count: 3 },
      ],
      error: null,
    });
    const tallies = await fetchPollTallies(client, "story-1");
    expect(from).toHaveBeenCalledWith("outlet_poll_tallies");
    // No outlet_id filter — this is the whole-story query, not per-outlet.
    expect(eq).toHaveBeenCalledWith("story_id", "story-1");
    expect(eq).toHaveBeenCalledTimes(1);
    expect(tallies).toEqual({
      o1: { critical: 2, balanced: 7, friendly: 0, total: 9 },
      o2: { critical: 0, balanced: 0, friendly: 3, total: 3 },
    });
  });

  it("returns an empty object when there are no responses yet", async () => {
    const { client } = makeMockSupabase({ data: [], error: null });
    expect(await fetchPollTallies(client, "story-1")).toEqual({});
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchPollTallies(client, "story-1")).rejects.toThrow(
      "Failed to fetch poll tallies: boom"
    );
  });
});

function makeUpdateMock(result: { data: any; error: any }) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ update });
  return { client: { from } as any, from, update, eq };
}

describe("claimHandle", () => {
  it("updates the profile's handle", async () => {
    const { client, from, update, eq } = makeUpdateMock({ data: null, error: null });
    await claimHandle(client, "user-1", "amit_57");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ handle: "amit_57" });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeUpdateMock({ data: null, error: { message: "duplicate" } });
    await expect(claimHandle(client, "user-1", "amit_57")).rejects.toThrow(
      "Failed to claim handle: duplicate"
    );
  });
});

describe("setCompassPosition", () => {
  it("updates the profile's compass position and taken-at timestamp", async () => {
    const { client, update } = makeUpdateMock({ data: null, error: null });
    await setCompassPosition(client, "user-1", 42);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ compass_position: 42 })
    );
  });
});

describe("fetchPublicProfile", () => {
  function makeSelectMock(result: { data: any; error: any }) {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, select, eq };
  }

  it("returns the profile when found", async () => {
    const profile = { id: "user-1", handle: "amit_57", compass_position: 10 };
    const { client, from } = makeSelectMock({ data: profile, error: null });
    const result = await fetchPublicProfile(client, "amit_57");
    expect(from).toHaveBeenCalledWith("public_profiles");
    expect(result).toEqual(profile);
  });

  it("returns null when no profile has that handle", async () => {
    const { client } = makeSelectMock({ data: null, error: null });
    expect(await fetchPublicProfile(client, "nobody")).toBeNull();
  });
});

describe("fetchListById", () => {
  function makeSelectMock(result: { data: any; error: any }) {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, select, eq };
  }

  const VALID_LIST_ID = "11111111-1111-1111-1111-111111111111";

  it("returns the list when found", async () => {
    const list = {
      id: VALID_LIST_ID,
      owner_id: "user-1",
      name: "Reposts",
      description: null,
      is_public: true,
      is_default: true,
      created_at: "2026-08-01T00:00:00Z",
    };
    const { client, from, eq } = makeSelectMock({ data: list, error: null });
    const result = await fetchListById(client, VALID_LIST_ID);
    expect(from).toHaveBeenCalledWith("lists");
    expect(eq).toHaveBeenCalledWith("id", VALID_LIST_ID);
    expect(result).toEqual(list);
  });

  it("returns null when no list has that id (not found, or private and not visible via RLS)", async () => {
    const { client } = makeSelectMock({ data: null, error: null });
    expect(await fetchListById(client, VALID_LIST_ID)).toBeNull();
  });

  it("returns null without querying when the id isn't a valid uuid (bad link/typo)", async () => {
    const { client, from } = makeSelectMock({ data: null, error: null });
    expect(await fetchListById(client, "nonexistent")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeSelectMock({ data: null, error: { message: "boom" } });
    await expect(fetchListById(client, VALID_LIST_ID)).rejects.toThrow("Failed to fetch list: boom");
  });
});

describe("createDefaultRepostsList", () => {
  it("inserts a public, default-flagged list named Reposts", async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: "list-1" }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const client = { from } as any;

    const id = await createDefaultRepostsList(client, "user-1");

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "user-1", name: "Reposts", is_public: true, is_default: true })
    );
    expect(id).toBe("list-1");
  });
});

describe("completePendingHandleClaim", () => {
  function makeMockSupabase(handleResult: { data: any; error: any }, listResult: { data: any; error: any }) {
    const calls: string[] = [];

    const eqHandle = jest.fn().mockImplementation(async () => {
      calls.push("claimHandle");
      return handleResult;
    });
    const update = jest.fn().mockReturnValue({ eq: eqHandle });

    const single = jest.fn().mockImplementation(async () => {
      calls.push("createDefaultRepostsList");
      return listResult;
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });

    const from = jest.fn((table: string) => {
      if (table === "profiles") return { update };
      if (table === "lists") return { insert };
      throw new Error(`unexpected table: ${table}`);
    });

    return { client: { from } as any, update, insert, calls };
  }

  it("claims the handle, then creates the default reposts list, in that order", async () => {
    const { client, update, insert, calls } = makeMockSupabase(
      { data: null, error: null },
      { data: { id: "list-1" }, error: null }
    );

    await completePendingHandleClaim(client, "user-1", "amit_57");

    expect(update).toHaveBeenCalledWith({ handle: "amit_57" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "user-1", name: "Reposts", is_public: true, is_default: true })
    );
    expect(calls).toEqual(["claimHandle", "createDefaultRepostsList"]);
  });

  it("propagates a claimHandle failure (e.g. handle taken) without creating a list", async () => {
    const { client, insert } = makeMockSupabase(
      { data: null, error: { message: "duplicate key value" } },
      { data: { id: "list-1" }, error: null }
    );

    await expect(completePendingHandleClaim(client, "user-1", "amit_57")).rejects.toThrow(
      "Failed to claim handle: duplicate key value"
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("propagates a createDefaultRepostsList failure after the handle was already claimed", async () => {
    const { client, update } = makeMockSupabase(
      { data: null, error: null },
      { data: null, error: { message: "boom" } }
    );

    await expect(completePendingHandleClaim(client, "user-1", "amit_57")).rejects.toThrow(
      "Failed to create default list: boom"
    );
    expect(update).toHaveBeenCalledWith({ handle: "amit_57" });
  });
});

describe("recoverPendingHandleClaim", () => {
  function makeMockSupabase(profileResult: { data: any; error: any }, listResult?: { data: any; error: any }) {
    const maybeSingle = jest.fn().mockResolvedValue(profileResult);
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const profileSelect = jest.fn().mockReturnValue({ eq });

    const single = jest.fn().mockResolvedValue(listResult ?? { data: { id: "list-1" }, error: null });
    const listSelect = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select: listSelect });

    // Deliberately no `update` on the "profiles" table object returned here
    // — recoverPendingHandleClaim must never call claimHandle (i.e. never
    // .update() the profile). If it ever did, calling `.update` on this mock
    // would throw (undefined is not a function), failing the test loudly
    // rather than silently letting a handle-overwrite path sneak back in.
    const from = jest.fn((table: string) => {
      if (table === "profiles") return { select: profileSelect };
      if (table === "lists") return { insert };
      throw new Error(`unexpected table: ${table}`);
    });

    return { client: { from } as any, insert };
  }

  it("does not retry list creation when the handle was never actually claimed", async () => {
    const { client, insert } = makeMockSupabase({
      data: { id: "user-1", handle: null, streak_count: 0, longest_streak: 0, sides_seen_total: 0 },
      error: null,
    });

    const result = await recoverPendingHandleClaim(client, "user-1");

    expect(result?.handle).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("retries default list creation once when the claim actually succeeded before the failure", async () => {
    const { client, insert } = makeMockSupabase({
      data: { id: "user-1", handle: "amit_57", streak_count: 0, longest_streak: 0, sides_seen_total: 0 },
      error: null,
    });

    const result = await recoverPendingHandleClaim(client, "user-1");

    expect(result?.handle).toBe("amit_57");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "user-1", name: "Reposts", is_public: true, is_default: true })
    );
  });

  // This is the regression case: claimHandle succeeded, createDefaultRepostsList
  // then threw. A second completePendingHandleClaim call with a DIFFERENT
  // handle must never run here — recoverPendingHandleClaim only ever reads
  // the profile and retries the list creation, so there is no code path by
  // which it could overwrite the already-claimed handle.
  it("does not throw and still returns the claimed handle when the retried list creation fails again", async () => {
    const { client, insert } = makeMockSupabase(
      { data: { id: "user-1", handle: "amit_57", streak_count: 0, longest_streak: 0, sides_seen_total: 0 }, error: null },
      { data: null, error: { message: "still failing" } }
    );

    const result = await recoverPendingHandleClaim(client, "user-1");

    expect(result?.handle).toBe("amit_57");
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("createList", () => {
  it("inserts a private, non-default list", async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: "list-2" }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const client = { from } as any;

    const id = await createList(client, "user-1", "Stories that changed my mind", null);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: "user-1",
        name: "Stories that changed my mind",
        is_public: false,
        is_default: false,
      })
    );
    expect(id).toBe("list-2");
  });
});

describe("fetchUserLists / fetchPublicLists", () => {
  function makeListsMock(result: { data: any; error: any }) {
    const order = jest.fn().mockResolvedValue(result);
    const eqPublic = jest.fn().mockReturnValue({ order });
    const eqOwner = jest.fn().mockReturnValue({ order, eq: eqPublic });
    const select = jest.fn().mockReturnValue({ eq: eqOwner });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, select, eqOwner, eqPublic, order };
  }

  it("fetchUserLists filters by owner only", async () => {
    const lists = [{ id: "l1" }];
    const { client, eqOwner } = makeListsMock({ data: lists, error: null });
    const result = await fetchUserLists(client, "user-1");
    expect(eqOwner).toHaveBeenCalledWith("owner_id", "user-1");
    expect(result).toEqual(lists);
  });

  it("fetchPublicLists filters by owner and is_public", async () => {
    const lists = [{ id: "l1", is_public: true }];
    const { client, eqOwner, eqPublic } = makeListsMock({ data: lists, error: null });
    const result = await fetchPublicLists(client, "user-1");
    expect(eqOwner).toHaveBeenCalledWith("owner_id", "user-1");
    expect(eqPublic).toHaveBeenCalledWith("is_public", true);
    expect(result).toEqual(lists);
  });
});

describe("fetchListItems", () => {
  it("returns items ordered by position", async () => {
    const items = [{ id: "i1", position: 0 }];
    const order = jest.fn().mockResolvedValue({ data: items, error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const client = { from } as any;

    const result = await fetchListItems(client, "list-1");
    expect(eq).toHaveBeenCalledWith("list_id", "list-1");
    expect(order).toHaveBeenCalledWith("position");
    expect(result).toEqual(items);
  });
});

describe("addStoryToList", () => {
  it("computes the next position from the current max and upserts", async () => {
    const limit = jest.fn().mockResolvedValue({ data: [{ position: 2 }], error: null });
    const order = jest.fn().mockReturnValue({ limit });
    const eqSelect = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq: eqSelect });
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const from = jest.fn().mockReturnValue({ select, upsert });
    const client = { from } as any;

    await addStoryToList(client, "list-1", "story-1");

    expect(upsert).toHaveBeenCalledWith(
      { list_id: "list-1", story_id: "story-1", position: 3 },
      { onConflict: "list_id,story_id", ignoreDuplicates: true }
    );
  });

  it("starts at position 0 for an empty list", async () => {
    const limit = jest.fn().mockResolvedValue({ data: [], error: null });
    const order = jest.fn().mockReturnValue({ limit });
    const eqSelect = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq: eqSelect });
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const from = jest.fn().mockReturnValue({ select, upsert });
    const client = { from } as any;

    await addStoryToList(client, "list-1", "story-1");

    expect(upsert).toHaveBeenCalledWith(
      { list_id: "list-1", story_id: "story-1", position: 0 },
      { onConflict: "list_id,story_id", ignoreDuplicates: true }
    );
  });
});

describe("removeStoryFromList", () => {
  it("deletes the matching list_items row", async () => {
    const eqStory = jest.fn().mockResolvedValue({ data: null, error: null });
    const eqList = jest.fn().mockReturnValue({ eq: eqStory });
    const del = jest.fn().mockReturnValue({ eq: eqList });
    const from = jest.fn().mockReturnValue({ delete: del });
    const client = { from } as any;

    await removeStoryFromList(client, "list-1", "story-1");
    expect(eqList).toHaveBeenCalledWith("list_id", "list-1");
    expect(eqStory).toHaveBeenCalledWith("story_id", "story-1");
  });
});

describe("toggleListPublic", () => {
  it("updates is_public on the given list", async () => {
    const eq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    const client = { from } as any;

    await toggleListPublic(client, "list-1", true);
    expect(update).toHaveBeenCalledWith({ is_public: true });
    expect(eq).toHaveBeenCalledWith("id", "list-1");
  });
});

describe("reorderListItems", () => {
  it("applies one position update per item", async () => {
    const eq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });
    const client = { from } as any;

    await reorderListItems(client, [
      { id: "i1", position: 0 },
      { id: "i2", position: 1 },
    ]);

    expect(update).toHaveBeenCalledWith({ position: 0 });
    expect(update).toHaveBeenCalledWith({ position: 1 });
    expect(eq).toHaveBeenCalledWith("id", "i1");
    expect(eq).toHaveBeenCalledWith("id", "i2");
  });
});

describe("applyPollDrift", () => {
  function makeMock(profileRow: any) {
    const maybeSingle = jest.fn().mockResolvedValue({ data: profileRow, error: null });
    const eqSelect = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq: eqSelect });
    const eqUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn().mockReturnValue({ eq: eqUpdate });
    const from = jest.fn().mockReturnValue({ select, update });
    return { client: { from } as any, select, update, eqUpdate };
  }

  it("reads the current drift state, computes the new one, and writes it back", async () => {
    const { client, update, eqUpdate } = makeMock({
      compass_position: 0,
      compass_week_started_at: null,
      compass_week_delta: 0,
    });

    await applyPollDrift(client, "user-1", "friendly");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        compass_position: expect.any(Number),
        compass_week_delta: expect.any(Number),
      })
    );
    expect(eqUpdate).toHaveBeenCalledWith("id", "user-1");
  });

  it("does nothing when there is no profile row at all", async () => {
    const { client, update } = makeMock(null);

    await applyPollDrift(client, "user-1", "friendly");

    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing if the profile has never taken the quiz (position is null)", async () => {
    const { client, update } = makeMock({
      compass_position: null,
      compass_week_started_at: null,
      compass_week_delta: 0,
    });

    await applyPollDrift(client, "user-1", "friendly");

    expect(update).not.toHaveBeenCalled();
  });
});

describe("fetchOwnPollResponses", () => {
  function makeMockSupabase(result: { data: any; error: any }) {
    const eq = jest.fn().mockResolvedValue(result);
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    return { client: { from } as any, from, select, eq };
  }

  it("returns the response values for the given user", async () => {
    const { client, from, select, eq } = makeMockSupabase({
      data: [{ response: "critical" }, { response: "friendly" }],
      error: null,
    });
    const result = await fetchOwnPollResponses(client, "user-1");
    expect(from).toHaveBeenCalledWith("outlet_poll_responses");
    expect(select).toHaveBeenCalledWith("response");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toEqual(["critical", "friendly"]);
  });

  it("returns an empty array when the user has answered no polls", async () => {
    const { client } = makeMockSupabase({ data: [], error: null });
    expect(await fetchOwnPollResponses(client, "user-1")).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchOwnPollResponses(client, "user-1")).rejects.toThrow(
      "Failed to fetch poll responses: boom"
    );
  });
});

describe("fetchOwnCompassStats", () => {
  function makeMockSupabase(profileResult: { data: any; error: any }, responsesData: any[]) {
    const from = jest.fn((table: string) => {
      if (table === "profiles") {
        const maybeSingle = jest.fn().mockResolvedValue(profileResult);
        const eq = jest.fn().mockReturnValue({ maybeSingle });
        const select = jest.fn().mockReturnValue({ eq });
        return { select };
      }
      // outlet_poll_responses
      const eq = jest.fn().mockResolvedValue({ data: responsesData, error: null });
      const select = jest.fn().mockReturnValue({ eq });
      return { select };
    });
    return { client: { from } as any, from };
  }

  it("combines the profile's position/week-delta with the poll-answer distribution", async () => {
    const { client } = makeMockSupabase(
      { data: { compass_position: 42, compass_week_delta: 2 }, error: null },
      [{ response: "critical" }, { response: "friendly" }]
    );
    const result = await fetchOwnCompassStats(client, "user-1");
    expect(result).toEqual({
      position: 42,
      weekDelta: 2,
      distribution: { critical: 50, balanced: 0, friendly: 50, total: 2 },
    });
  });

  it("returns null when the user hasn't taken the quiz yet", async () => {
    const { client } = makeMockSupabase({ data: { compass_position: null, compass_week_delta: 0 }, error: null }, []);
    expect(await fetchOwnCompassStats(client, "user-1")).toBeNull();
  });

  it("returns null when there is no profile row at all", async () => {
    const { client } = makeMockSupabase({ data: null, error: null }, []);
    expect(await fetchOwnCompassStats(client, "user-1")).toBeNull();
  });

  it("throws when Supabase returns an error fetching the profile", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } }, []);
    await expect(fetchOwnCompassStats(client, "user-1")).rejects.toThrow(
      "Failed to fetch compass stats: boom"
    );
  });
});

describe("fetchDiscoverableProfiles", () => {
  function makeMockSupabase(
    profiles: any[],
    lists: any[],
    items: any[],
    errors: { profiles?: any; lists?: any; items?: any } = {}
  ) {
    const from = jest.fn((table: string) => {
      if (table === "discoverable_profiles") {
        const order = jest.fn().mockResolvedValue({ data: profiles, error: errors.profiles ?? null });
        const select = jest.fn().mockReturnValue({ order });
        return { select };
      }
      if (table === "lists") {
        const eq = jest.fn().mockResolvedValue({ data: lists, error: errors.lists ?? null });
        const inFn = jest.fn().mockReturnValue({ eq });
        const select = jest.fn().mockReturnValue({ in: inFn });
        return { select };
      }
      // list_items
      const order = jest.fn().mockResolvedValue({ data: items, error: errors.items ?? null });
      const inFn = jest.fn().mockReturnValue({ order });
      const select = jest.fn().mockReturnValue({ in: inFn });
      return { select };
    });
    return { client: { from } as any, from };
  }

  it("pairs each discoverable profile with its public list's preview stories", async () => {
    const { client } = makeMockSupabase(
      [{ id: "p1", handle: "arjun", compass_position: -40 }],
      [{ id: "list-1", owner_id: "p1", name: "Arjun's picks" }],
      [
        { list_id: "list-1", position: 0, story: { canonical_headline: "H1", image_url: "img1" } },
        { list_id: "list-1", position: 1, story: { canonical_headline: "H2", image_url: null } },
      ]
    );

    const result = await fetchDiscoverableProfiles(client);

    expect(result).toEqual([
      {
        handle: "arjun",
        compassPosition: -40,
        listName: "Arjun's picks",
        previewStories: [
          { headline: "H1", imageUrl: "img1" },
          { headline: "H2", imageUrl: null },
        ],
      },
    ]);
  });

  it("caps preview stories per profile at 3", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      list_id: "list-1",
      position: i,
      story: { canonical_headline: `H${i}`, image_url: null },
    }));
    const { client } = makeMockSupabase(
      [{ id: "p1", handle: "arjun", compass_position: -40 }],
      [{ id: "list-1", owner_id: "p1", name: "Arjun's picks" }],
      items
    );

    const result = await fetchDiscoverableProfiles(client);

    expect(result[0].previewStories).toHaveLength(3);
    expect(result[0].previewStories.map((s: { headline: string | null }) => s.headline)).toEqual([
      "H0",
      "H1",
      "H2",
    ]);
  });

  it("returns a profile with no list as having no preview stories, not an error", async () => {
    const { client } = makeMockSupabase([{ id: "p1", handle: "arjun", compass_position: -40 }], [], []);

    const result = await fetchDiscoverableProfiles(client);

    expect(result).toEqual([
      { handle: "arjun", compassPosition: -40, listName: null, previewStories: [] },
    ]);
  });

  it("returns an empty array without querying lists/items when there are no discoverable profiles", async () => {
    const { client, from } = makeMockSupabase([], [], []);

    const result = await fetchDiscoverableProfiles(client);

    expect(result).toEqual([]);
    expect(from).not.toHaveBeenCalledWith("lists");
  });

  it("throws when Supabase returns an error fetching discoverable profiles", async () => {
    const { client } = makeMockSupabase([], [], [], { profiles: { message: "boom" } });
    await expect(fetchDiscoverableProfiles(client)).rejects.toThrow(
      "Failed to fetch discoverable profiles: boom"
    );
  });
});
