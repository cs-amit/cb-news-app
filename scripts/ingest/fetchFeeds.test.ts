import { dedupeByUrl, extractImageUrl, FeedItem } from "./fetchFeeds";

describe("dedupeByUrl", () => {
  it("removes duplicate URLs, keeping the first occurrence", () => {
    const items: FeedItem[] = [
      { title: "A", url: "https://x.com/1", snippet: "", publishedAt: null, imageUrl: null },
      { title: "A dup", url: "https://x.com/1", snippet: "", publishedAt: null, imageUrl: null },
      { title: "B", url: "https://x.com/2", snippet: "", publishedAt: null, imageUrl: null },
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

describe("extractImageUrl", () => {
  it("prefers a standard RSS enclosure image", () => {
    const item = {
      enclosure: { url: "https://cdn.example.com/photo.jpg", type: "image/jpeg" },
    };
    expect(extractImageUrl(item)).toBe("https://cdn.example.com/photo.jpg");
  });

  it("ignores a non-image enclosure (e.g. a podcast audio file)", () => {
    const item = {
      enclosure: { url: "https://cdn.example.com/episode.mp3", type: "audio/mpeg" },
    };
    expect(extractImageUrl(item)).toBeNull();
  });

  it("falls back to media:thumbnail when there is no usable enclosure", () => {
    const item = { mediaThumbnail: { $: { url: "https://cdn.example.com/thumb.jpg" } } };
    expect(extractImageUrl(item)).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("falls back to media:content when it looks like an image", () => {
    const item = {
      mediaContent: [{ $: { url: "https://cdn.example.com/media.jpg", medium: "image" } }],
    };
    expect(extractImageUrl(item)).toBe("https://cdn.example.com/media.jpg");
  });

  it("ignores media:content that isn't an image", () => {
    const item = {
      mediaContent: [{ $: { url: "https://cdn.example.com/clip.mp4", medium: "video" } }],
    };
    expect(extractImageUrl(item)).toBeNull();
  });

  it("returns null when nothing usable is present", () => {
    expect(extractImageUrl({})).toBeNull();
  });
});
