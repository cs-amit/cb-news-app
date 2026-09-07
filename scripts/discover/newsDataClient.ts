const NEWSDATA_LATEST_URL = "https://newsdata.io/api/1/latest";

export interface DiscoveredCandidate {
  title: string;
  url: string;
  outletName: string;
  publishedAt: string | null;
}

/** One credit per call, up to 10 results. See docs/superpowers/specs/2026-09-07-source-discovery-design.md. */
export async function searchNewsData(query: string, apiKey: string): Promise<DiscoveredCandidate[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    q: query,
    country: "in",
    language: "en",
  });
  const response = await fetch(`${NEWSDATA_LATEST_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`NewsData search failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((r: any) => ({
    title: r.title,
    url: r.link,
    outletName: r.source_name,
    publishedAt: r.pubDate ?? null,
  }));
}
