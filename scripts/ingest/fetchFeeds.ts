import Parser from "rss-parser";

export interface FeedItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
}

const parser = new Parser();

export async function fetchFeed(rssUrl: string): Promise<FeedItem[]> {
  const feed = await parser.parseURL(rssUrl);
  return feed.items
    .map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      snippet: item.contentSnippet ?? item.content ?? "",
      publishedAt: item.isoDate ?? null,
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
