import { outletFaviconUrl } from "./outletFavicon";

describe("outletFaviconUrl", () => {
  it("builds a favicon URL from a plain https RSS URL's domain", () => {
    expect(outletFaviconUrl("https://www.thehindu.com/feeder/default.rss")).toBe(
      "https://www.google.com/s2/favicons?domain=www.thehindu.com&sz=64"
    );
  });

  it("works for a YouTube channel feed URL", () => {
    expect(
      outletFaviconUrl("https://www.youtube.com/feeds/videos.xml?channel_id=UC123")
    ).toBe("https://www.google.com/s2/favicons?domain=www.youtube.com&sz=64");
  });

  it("returns null for a missing or malformed URL", () => {
    expect(outletFaviconUrl(null)).toBeNull();
    expect(outletFaviconUrl("")).toBeNull();
    expect(outletFaviconUrl("not a url")).toBeNull();
  });
});
