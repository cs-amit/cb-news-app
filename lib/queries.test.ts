import { fetchRecentStories, fetchSilentOutlets } from "./queries";

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
  function makeMockSupabase(byTable: Record<string, { data: any; error: any }>) {
    const from = jest.fn((table: string) => {
      const result = byTable[table];
      const builder: any = {};
      const chain = () => builder;
      builder.select = chain;
      builder.gte = chain;
      builder.eq = chain;
      builder.in = chain;
      builder.then = (onFulfilled: any) => Promise.resolve(result).then(onFulfilled);
      return builder;
    });
    return { from } as any;
  }

  it("returns outlets that are active but not covering, past the lag guard", async () => {
    const client = makeMockSupabase({
      articles: { data: [{ outlet_id: "o1" }, { outlet_id: "o2" }], error: null },
      outlets: {
        data: [
          { id: "o1", name: "A", is_youtube: false },
          { id: "o2", name: "B", is_youtube: false },
        ],
        error: null,
      },
    });
    // Second call to "articles" (covering outlets for the story) needs a
    // different result than the first (active outlets) — override `from`
    // to return per-call results in sequence.
    let call = 0;
    const articleResults = [
      { data: [{ outlet_id: "o1" }, { outlet_id: "o2" }], error: null }, // active outlets
      { data: [{ outlet_id: "o1" }], error: null }, // covering this story
    ];
    client.from = jest.fn((table: string) => {
      const builder: any = {};
      const chain = () => builder;
      builder.select = chain;
      builder.gte = chain;
      builder.eq = chain;
      builder.in = chain;
      builder.then = (onFulfilled: any) => {
        const result =
          table === "articles" ? articleResults[Math.min(call++, articleResults.length - 1)] : { data: [{ id: "o1", name: "A", is_youtube: false }, { id: "o2", name: "B", is_youtube: false }], error: null };
        return Promise.resolve(result).then(onFulfilled);
      };
      return builder;
    });

    const oldFirstSeen = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = await fetchSilentOutlets(client, "story-1", oldFirstSeen);

    expect(result.map((o) => o.id)).toEqual(["o2"]);
  });

  it("returns an empty array when no outlet has published recently", async () => {
    const client = makeMockSupabase({
      articles: { data: [], error: null },
      outlets: { data: [], error: null },
    });
    const oldFirstSeen = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = await fetchSilentOutlets(client, "story-1", oldFirstSeen);
    expect(result).toEqual([]);
  });
});
