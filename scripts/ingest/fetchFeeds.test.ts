import { dedupeByUrl, FeedItem } from "./fetchFeeds";

describe("dedupeByUrl", () => {
  it("removes duplicate URLs, keeping the first occurrence", () => {
    const items: FeedItem[] = [
      { title: "A", url: "https://x.com/1", snippet: "", publishedAt: null },
      { title: "A dup", url: "https://x.com/1", snippet: "", publishedAt: null },
      { title: "B", url: "https://x.com/2", snippet: "", publishedAt: null },
    ];
    const result = dedupeByUrl(items);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("A");
    expect(result.map((r) => r.url)).toEqual(["https://x.com/1", "https://x.com/2"]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeByUrl([])).toEqual([]);
  });
});
