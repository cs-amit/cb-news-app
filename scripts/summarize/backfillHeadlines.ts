import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { drainHeadlineBacklog } from "./drainHeadlineBacklog";
import { generateBatchHeadlines } from "./generateBatchHeadlines";

// One-off CLI: drain the entire eligible headline backlog in one run instead
// of waiting for the 2h cron to do it 300 stories at a time. See
// drainHeadlineBacklog.ts for why this exists.
async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { totalHeadlined, iterations } = await drainHeadlineBacklog(supabase, (batch) =>
    generateBatchHeadlines(batch, geminiKey)
  );
  console.log(`Backfill complete: headlined ${totalHeadlined} stories over ${iterations} batch-run(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Headline backfill failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
