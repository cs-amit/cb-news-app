import { SupabaseClient } from "@supabase/supabase-js";
import { OutletSample, OutletScore } from "./generateOutletScores";

// Below this many sampled headlines, a score isn't credible enough to
// publish (spec requirement: outlet scores need sample size visible and
// meaningful — an outlet with 1-2 articles shouldn't get a confident score).
const MIN_SAMPLE_SIZE = 5;
const MAX_SAMPLE_PER_OUTLET = 20;

export async function scoreOutlets(
  supabase: SupabaseClient,
  scoreFn: (outlets: OutletSample[]) => Promise<Map<string, OutletScore>>
): Promise<number> {
  const { data: outlets, error } = await supabase.from("outlets").select("id, name");
  if (error) throw new Error(`Failed to fetch outlets: ${error.message}`);
  if (!outlets || outlets.length === 0) return 0;

  const samples: OutletSample[] = [];
  for (const outlet of outlets) {
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("title")
      .eq("outlet_id", outlet.id)
      // published_at is nullable (feeds sometimes omit a date). Postgres sorts
      // NULLS FIRST by default on DESC, so without nullsFirst:false an outlet
      // with any undated articles would sample those instead of its actual
      // most-recent headlines.
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(MAX_SAMPLE_PER_OUTLET);
    if (articlesError || !articles || articles.length < MIN_SAMPLE_SIZE) continue;
    samples.push({ id: outlet.id, name: outlet.name, titles: articles.map((a: any) => a.title) });
  }
  if (samples.length === 0) return 0;

  let results: Map<string, OutletScore>;
  try {
    results = await scoreFn(samples);
  } catch (err) {
    console.error("Failed to generate outlet scores:", err instanceof Error ? err.message : err);
    return 0;
  }

  let scored = 0;
  for (const sample of samples) {
    const result = results.get(sample.id);
    if (!result) {
      console.error(`Scoring response did not include a score for outlet ${sample.id}`);
      continue;
    }
    const { error: updateError } = await supabase
      .from("outlets")
      .update({
        govt_lean_score: result.govtLeanScore,
        sensationalism_score: result.sensationalismScore,
        govt_lean_sample_size: sample.titles.length,
        govt_lean_updated_at: new Date().toISOString(),
      })
      .eq("id", sample.id);
    if (updateError) {
      console.error(`Failed to save score for outlet ${sample.id}: ${updateError.message}`);
      continue;
    }
    scored += 1;
  }
  return scored;
}
