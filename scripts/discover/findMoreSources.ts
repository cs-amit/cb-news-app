import { SupabaseClient } from "@supabase/supabase-js";
import { cosineSimilarity } from "../cluster/similarity";
import { parseEmbedding } from "../cluster/clusterStories";
import { DiscoveredCandidate } from "./newsDataClient";

// Self-limiting per run rather than a persisted daily-usage counter, matching
// scripts/summarize/fillMissingHeadlines.ts's MAX_REQUESTS_PER_RUN convention.
// At 4 runs/day (see .github/workflows/discover.yml) this caps NewsData.io
// usage at 60 calls/day, well under the 200 credits/day free tier.
const MAX_LOOKUPS_PER_RUN = 15;

// Give RSS ingestion a real chance to pick up a second source on its own
// before spending an API lookup on a story.
const ELIGIBILITY_AGE_HOURS = 6;

export interface FindMoreSourcesResult {
  checked: number;
  discovered: number;
}

export async function findMoreSources(
  supabase: SupabaseClient,
  searchFn: (query: string) => Promise<DiscoveredCandidate[]>,
  embedFn: (text: string) => Promise<number[]>,
  similarityThreshold: number
): Promise<FindMoreSourcesResult> {
  const cutoff = new Date(Date.now() - ELIGIBILITY_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const { data: eligible, error } = await supabase
    .from("stories")
    .select("id, canonical_headline, founder_article_id")
    .not("canonical_headline", "is", null)
    .eq("article_count", 1)
    .lte("first_seen_at", cutoff)
    .is("source_discovery_checked_at", null)
    .order("first_seen_at", { ascending: true })
    .limit(MAX_LOOKUPS_PER_RUN);
  if (error) throw new Error(`Failed to fetch eligible stories: ${error.message}`);
  if (!eligible || eligible.length === 0) return { checked: 0, discovered: 0 };

  const founderIds = [
    ...new Set(eligible.map((s: any) => s.founder_article_id).filter((id: unknown): id is string => !!id)),
  ];
  const founderEmbeddingById = new Map<string, number[]>();
  if (founderIds.length > 0) {
    const { data: founders, error: foundersError } = await supabase
      .from("articles")
      .select("id, embedding")
      .in("id", founderIds);
    if (foundersError) throw new Error(`Failed to fetch founder embeddings: ${foundersError.message}`);
    for (const row of (founders ?? []) as { id: string; embedding: unknown }[]) {
      const embedding = parseEmbedding(row.embedding);
      if (embedding) founderEmbeddingById.set(row.id, embedding);
    }
  }

  let checked = 0;
  let discovered = 0;
  for (const story of eligible as {
    id: string;
    canonical_headline: string;
    founder_article_id: string | null;
  }[]) {
    const founderEmbedding = story.founder_article_id
      ? founderEmbeddingById.get(story.founder_article_id)
      : undefined;
    // Can't relevance-check without a founder embedding to compare against —
    // skip and leave unstamped so it's retried once one becomes available,
    // rather than silently accepting unfiltered search noise.
    if (!founderEmbedding) continue;

    let candidates: DiscoveredCandidate[];
    try {
      candidates = await searchFn(story.canonical_headline);
    } catch (err) {
      // Transient (network/rate-limit) — don't stamp checked_at, retry next run.
      console.error(`Discovery search failed for story ${story.id}:`, err);
      continue;
    }

    for (const candidate of candidates) {
      const candidateEmbedding = await embedFn(candidate.title);
      const similarity = cosineSimilarity(founderEmbedding, candidateEmbedding);
      if (similarity < similarityThreshold) continue;
      const { error: upsertError } = await supabase.from("discovered_articles").upsert(
        {
          story_id: story.id,
          outlet_name: candidate.outletName,
          url: candidate.url,
          title: candidate.title,
          published_at: candidate.publishedAt,
          similarity,
        },
        { onConflict: "url" }
      );
      if (!upsertError) discovered += 1;
    }

    // We genuinely checked this story (search call succeeded), so stamp it
    // regardless of whether anything cleared the similarity bar — a story
    // with no good matches shouldn't be re-queried every run forever.
    const { error: stampError } = await supabase
      .from("stories")
      .update({ source_discovery_checked_at: new Date().toISOString() })
      .eq("id", story.id);
    if (!stampError) checked += 1;
  }

  return { checked, discovered };
}
