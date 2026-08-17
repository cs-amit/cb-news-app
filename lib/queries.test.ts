import { fetchRecentStories } from "./queries";

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
