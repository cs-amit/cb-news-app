import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { scoreOutlets } from "./scoreOutlets";
import { generateOutletScores } from "./generateOutletScores";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY must be set");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const scored = await scoreOutlets(supabase, (outlets) => generateOutletScores(outlets, geminiKey));
  console.log(`Scored ${scored} outlets.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
