import { searchNewsData } from "./newsDataClient";

describe("searchNewsData", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("maps results to candidate articles on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        totalResults: 2,
        results: [
          {
            title: "Building collapse near Delhi University",
            link: "https://example.com/a",
            source_id: "example",
            source_name: "Example News",
            pubDate: "2026-09-07 10:00:00",
          },
          {
            title: "Second outlet covers the collapse",
            link: "https://other.com/b",
            source_id: "other",
            source_name: "Other Outlet",
            pubDate: null,
          },
        ],
        nextPage: null,
      }),
    }) as any;

    const result = await searchNewsData("Building collapse", "fake-key");
    expect(result).toEqual([
      {
        title: "Building collapse near Delhi University",
        url: "https://example.com/a",
        outletName: "Example News",
        publishedAt: "2026-09-07 10:00:00",
      },
      {
        title: "Second outlet covers the collapse",
        url: "https://other.com/b",
        outletName: "Other Outlet",
        publishedAt: null,
      },
    ]);
  });

  it("returns an empty array when results is missing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", totalResults: 0, results: null }),
    }) as any;

    expect(await searchNewsData("nothing found", "fake-key")).toEqual([]);
  });

  it("throws when the response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    }) as any;

    await expect(searchNewsData("query", "fake-key")).rejects.toThrow(
      "NewsData search failed: 429"
    );
  });
});
