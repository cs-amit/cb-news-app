import Parser from "rss-parser";

export interface FeedItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
  imageUrl: string | null;
}

// media:content/media:thumbnail (Media RSS, common in Indian news feeds) are
// namespaced tags rss-parser doesn't surface unless told to look for them.
const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

/**
 * Feeds disagree on where an item's image lives. Prefer the standard RSS
 * `<enclosure>` (but only when it's actually an image — enclosures are also
 * used for podcast audio), then Media RSS's `media:thumbnail`, then
 * `media:content` (only when explicitly marked as an image; it's also used
 * for video). Returns null rather than guessing when nothing qualifies.
 */
export function extractImageUrl(item: any): string | null {
  const enclosure = item?.enclosure;
  if (enclosure?.url && (!enclosure.type || enclosure.type.startsWith("image/"))) {
    return enclosure.url;
  }
  const thumbnailUrl = item?.mediaThumbnail?.$?.url;
  if (thumbnailUrl) return thumbnailUrl;
  const mediaContent = Array.isArray(item?.mediaContent) ? item.mediaContent[0]?.$ : undefined;
  if (mediaContent?.url && (!mediaContent.medium || mediaContent.medium === "image")) {
    return mediaContent.url;
  }
  return null;
}

export async function fetchFeed(rssUrl: string): Promise<FeedItem[]> {
  const feed = await parser.parseURL(rssUrl);
  return feed.items
    .map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      snippet: item.contentSnippet ?? item.content ?? "",
      publishedAt: item.isoDate ?? null,
      imageUrl: extractImageUrl(item),
    }))
    .filter((item) => item.url && item.title);
}

export function dedupeByUrl(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  const result: FeedItem[] = [];
  for (const item of items) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      result.push(item);
    }
  }
  return result;
}
