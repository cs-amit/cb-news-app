import { upsertArticles } from "./upsertArticles";
import { FeedItem } from "./fetchFeeds";

function makeMockSupabase(upsertResult: { error: any; count: number }) {
  const upsert = jest.fn().mockResolvedValue(upsertResult);
  const from = jest.fn().mockReturnValue({ upsert });
  return { client: { from } as any, upsert, from };
}

describe("upsertArticles", () => {
  it("maps feed items to article rows with the given outlet id", async () => {
    const { client, upsert, from } = makeMockSupabase({ error: null, count: 2 });
    const items: FeedItem[] = [
      { title: "A", url: "https://x.com/1", snippet: "s1", publishedAt: "2026-08-01T00:00:00Z" },
      { title: "B", url: "https://x.com/2", snippet: "s2", publishedAt: null },
    ];

    const count = await upsertArticles(client, "outlet-123", items);

    expect(from).toHaveBeenCalledWith("articles");
    expect(upsert).toHaveBeenCalledWith(
      [
        { outlet_id: "outlet-123", title: "A", url: "https://x.com/1", snippet: "s1", published_at: "2026-08-01T00:00:00Z" },
        { outlet_id: "outlet-123", title: "B", url: "https://x.com/2", snippet: "s2", published_at: null },
      ],
      { onConflict: "url", ignoreDuplicates: true, count: "exact" }
    );
    expect(count).toBe(2);
  });

  it("returns 0 without calling Supabase when items is empty", async () => {
    const { client, upsert } = makeMockSupabase({ error: null, count: 0 });
    const count = await upsertArticles(client, "outlet-123", []);
    expect(count).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("throws when Supabase returns an error", async () => {
    const { client } = makeMockSupabase({ error: { message: "boom" }, count: 0 });
    await expect(
      upsertArticles(client, "outlet-123", [
        { title: "A", url: "https://x.com/1", snippet: "", publishedAt: null },
      ])
    ).rejects.toThrow("Failed to upsert articles: boom");
  });
});
