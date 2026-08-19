import { fetchRecentStories, fetchSilentOutlets, fetchMethodologyStats } from "./queries";
import { fetchConflictFlags } from "./queries";

function makeMockSupabase(result: { data: any; error: any }) {
  const limit = jest.fn().mockResolvedValue(result);
  const order = jest.fn().mockReturnValue({ limit });
  const not = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ not });
  const from = jest.fn().mockReturnValue({ select });
  return { client: { from } as any, from, select, not, order, limit };
}

describe("fetchRecentStories", () => {
  it("returns the story list on success", async () => {
    const stories = [
      { id: "1", canonical_headline: "H", summary: "S", first_seen_at: "2026-08-01T00:00:00Z" },
    ];
    const { client, from } = makeMockSupabase({ data: stories, error: null });
    const result = await fetchRecentStories(client);
    expect(from).toHaveBeenCalledWith("stories");
    expect(result).toEqual(stories);
  });

  it("excludes stories that have no headline yet", async () => {
    const { client, not, order, limit } = makeMockSupabase({ data: [], error: null });
    await fetchRecentStories(client);
    expect(not).toHaveBeenCalledWith("canonical_headline", "is", null);
    expect(order).toHaveBeenCalledWith("first_seen_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(50);
  });

  it("returns an empty array when data is null", async () => {
    const { client } = makeMockSupabase({ data: null, error: null });
    expect(await fetchRecentStories(client)).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ data: null, error: { message: "boom" } });
    await expect(fetchRecentStories(client)).rejects.toThrow("Failed to fetch stories: boom");
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
