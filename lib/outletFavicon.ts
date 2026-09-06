/**
 * Derives a small outlet icon from its RSS feed URL's domain, via Google's
 * public favicon-lookup service (free, no scraping, no per-outlet asset to
 * maintain). Returns null when there's nothing to key off of rather than
 * guessing — callers should fall back to an initial/placeholder.
 */
export function outletFaviconUrl(rssUrl: string | null | undefined): string | null {
  if (!rssUrl) return null;
  try {
    const { hostname } = new URL(rssUrl);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}
