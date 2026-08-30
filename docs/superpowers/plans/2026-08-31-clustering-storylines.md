# Clustering Fix + Storyline Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the story-clustering multi-source rate by catching same-event coverage the current single-threshold clusterer misses (especially cross-language pairs), and add a storyline layer that groups related-but-distinct stories over time (announcement → detail → follow-up), so the "compare across outlets" pitch has more material to show.

**Architecture:** Two independent sub-systems sharing one new utility. (1) A shared `extractEntityKeys` function turns a headline into a small set of proper-noun/number tokens. (2) The existing article-level clusterer (`clusterStories.ts`/`similarity.ts`) gains a second, lower similarity threshold that only fires when entity keys corroborate it — catching cross-language matches without a blanket false-merge risk. (3) A new story-level `assignStorylines` pass runs after headline generation, pooling each story's article embeddings/entity-keys and matching them against recently-active storylines on a looser cosine bound plus a stricter entity floor.

**Tech Stack:** TypeScript, `tsx` scripts, Jest (`ts-jest`), Supabase (Postgres + pgvector), `@supabase/supabase-js`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-clustering-storylines-design.md`

## Global Constraints

- No UI changes — this plan is backend/pipeline only (spec §0 scope, §5 out of scope).
- `SIMILARITY_THRESHOLD_HIGH` = 0.86, `SIMILARITY_THRESHOLD_MID` = 0.78 (spec §2).
- `STORYLINE_SIM_THRESHOLD` = 0.65, `STORYLINE_ENTITY_MIN` = 2 (spec §3) — flagged in the spec as first-cut estimates, not diagnosed against real data; do not "fix" this during implementation, it's an intentional known gap.
- `STORYLINE_CANDIDATE_BATCH_SIZE` = 500, `STORYLINE_WINDOW_HOURS` = 240 (spec §3).
- Per-item failures (a single story/article) log via `console.error` and continue; only a total fetch failure throws — matches the existing tolerance pattern in `clusterStories.ts` and `fillMissingHeadlines.ts`.
- Migrations are applied to the live Supabase project via the `mcp__supabase__apply_migration` tool, not run locally — this is the established project workflow (see `0006`–`0008`).
- Run `npm test` after every task; it must stay green throughout.

---

### Task 1: Entity extraction utility

**Files:**
- Create: `lib/entities.ts`
- Test: `lib/entities.test.ts`

**Interfaces:**
- Produces: `extractEntityKeys(text: string): string[]` — lowercased, deduplication not guaranteed (callers that need set semantics dedupe themselves, see Task 2's `overlapCount`).

- [ ] **Step 1: Write the failing tests**

Create `lib/entities.test.ts`:

```ts
import { extractEntityKeys } from "./entities";

describe("extractEntityKeys", () => {
  it("extracts numeric tokens, including decimals", () => {
    expect(extractEntityKeys("9.26 lakh passengers")).toEqual(
      expect.arrayContaining(["9.26"])
    );
  });

  it("extracts short ALL-CAPS tokens like state abbreviations", () => {
    expect(extractEntityKeys("UP Govt Big Gift For Women")).toEqual(
      expect.arrayContaining(["up"])
    );
  });

  it("filters out common stopwords even when capitalized by title case", () => {
    const keys = extractEntityKeys("UP Extends Free Bus Travel To Women Above 60");
    expect(keys).not.toContain("to");
  });

  it("strips trailing punctuation and still keeps the numeric token", () => {
    expect(extractEntityKeys("60+ महिलाओं")).toEqual(["60"]);
  });

  it("finds real overlap between the diagnosed cross-lingual headline pair", () => {
    const a = extractEntityKeys("UP Extends Free Bus Travel To Women Above 60");
    const b = extractEntityKeys("UP Govt Big Gift For Women: 60+ महिलाओं");
    const overlap = a.filter((k) => b.includes(k));
    expect(overlap).toEqual(expect.arrayContaining(["up", "60", "women"]));
  });

  it("lowercases tokens so comparisons are case-insensitive", () => {
    expect(extractEntityKeys("Delhi")).toEqual(["delhi"]);
  });

  it("returns an empty array for text with no significant tokens", () => {
    expect(extractEntityKeys("the a an is are")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest lib/entities.test.ts`
Expected: FAIL with "Cannot find module './entities'" (the file doesn't exist yet).

- [ ] **Step 3: Implement `lib/entities.ts`**

```ts
// Numeric tokens (including one decimal point, e.g. "9.26") are checked as a
// single alternative before the general word pattern so tokenization doesn't
// split "9.26" into "9" and "26" at the dot.
const TOKEN_PATTERN = /\d+\.\d+|[\p{L}\p{N}]+/gu;
const NUMERIC_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

// Sentence-initial common words that Title Case headlines capitalize anyway
// ("UP Extends ... To Women") and that would otherwise pass the capitalized-
// word check below despite carrying no entity signal.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "of", "in", "on", "at", "to",
  "for", "and", "or", "but", "with", "as", "by", "from", "this", "that",
]);

/**
 * Pulls a small set of proper-noun/number tokens out of a headline for use
 * as a cheap corroboration signal alongside embedding cosine similarity.
 * No LLM call — deterministic and synchronous.
 *
 * Known limitation: a capitalized-word check has no signal in scripts
 * without letter case (e.g. Devanagari), so a pure-Devanagari headline only
 * contributes its numeric tokens here.
 */
export function extractEntityKeys(text: string): string[] {
  const tokens = text.match(TOKEN_PATTERN) ?? [];
  const keys: string[] = [];
  for (const token of tokens) {
    if (NUMERIC_PATTERN.test(token)) {
      keys.push(token.toLowerCase());
      continue;
    }
    const isCapitalizedWord = /^[A-Z]/.test(token) && token.length >= 2;
    if (isCapitalizedWord && !STOPWORDS.has(token.toLowerCase())) {
      keys.push(token.toLowerCase());
    }
  }
  return keys;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest lib/entities.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add lib/entities.ts lib/entities.test.ts
git commit -m "feat: add entity-key extraction utility for clustering/storyline corroboration"
```

---

### Task 2: Dual-threshold entity-guarded clustering in `similarity.ts`

**Files:**
- Modify: `scripts/cluster/similarity.ts`
- Test: `scripts/cluster/similarity.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (entity keys are passed in already-extracted; this file has no dependency on `lib/entities`).
- Produces: `EmbeddedArticle { id: string; embedding: number[]; entityKeys: string[] }`, `overlapCount(a: string[], b: string[]): number`, `clusterBySimilarity(articles: EmbeddedArticle[], highThreshold: number, midThreshold: number): Cluster[]` — signature changed from the old single-threshold form; Task 4 updates the one caller.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `scripts/cluster/similarity.test.ts` with:

```ts
import { cosineSimilarity, clusterBySimilarity, overlapCount } from "./similarity";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("throws when vectors have different lengths", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow("Vectors must be the same length");
  });
});

describe("overlapCount", () => {
  it("counts unique shared keys, ignoring duplicates within a side", () => {
    expect(overlapCount(["up", "60", "up"], ["up", "women"])).toBe(1);
  });

  it("returns 0 when there is no overlap", () => {
    expect(overlapCount(["a"], ["b"])).toBe(0);
  });

  it("returns 0 for empty inputs", () => {
    expect(overlapCount([], ["a"])).toBe(0);
  });
});

describe("clusterBySimilarity", () => {
  it("groups near-identical embeddings into one cluster (high-threshold path)", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: [] },
      { id: "b", embedding: [0.99, 0.01], entityKeys: [] },
      { id: "c", embedding: [0, 1], entityKeys: [] },
    ];
    const clusters = clusterBySimilarity(articles, 0.9, 0.9);
    expect(clusters).toHaveLength(2);
    const clusterWithA = clusters.find((c) => c.articleIds.includes("a"));
    expect(clusterWithA?.articleIds.sort()).toEqual(["a", "b"]);
  });

  it("puts every article in its own cluster when nothing meets either threshold", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: [] },
      { id: "b", embedding: [0, 1], entityKeys: [] },
    ];
    const clusters = clusterBySimilarity(articles, 0.99, 0.99);
    expect(clusters).toHaveLength(2);
  });

  it("returns an empty array for no articles", () => {
    expect(clusterBySimilarity([], 0.9, 0.9)).toEqual([]);
  });

  it("merges below the high threshold when entity keys overlap", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: ["up", "60"] },
      { id: "b", embedding: [0.8, 0.6], entityKeys: ["up", "women"] }, // cosine 0.8
    ];
    const clusters = clusterBySimilarity(articles, 0.9, 0.75);
    expect(clusters).toHaveLength(1);
  });

  it("does not merge below the high threshold without entity overlap", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: ["delhi"] },
      { id: "b", embedding: [0.8, 0.6], entityKeys: ["mumbai"] }, // cosine 0.8, no shared entities
    ];
    const clusters = clusterBySimilarity(articles, 0.9, 0.75);
    expect(clusters).toHaveLength(2);
  });

  it("does not merge on entity overlap alone when cosine is below the mid threshold", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: ["up", "60"] },
      { id: "b", embedding: [0, 1], entityKeys: ["up", "60"] }, // cosine 0
    ];
    const clusters = clusterBySimilarity(articles, 0.9, 0.75);
    expect(clusters).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest scripts/cluster/similarity.test.ts`
Expected: FAIL — `overlapCount` is not exported, and `clusterBySimilarity` doesn't accept a second threshold or `entityKeys` yet.

- [ ] **Step 3: Update `scripts/cluster/similarity.ts`**

Replace its full contents with:

```ts
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must be the same length");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Size of the unique intersection of two entity-key sets. */
export function overlapCount(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let count = 0;
  for (const key of setA) {
    if (setB.has(key)) count += 1;
  }
  return count;
}

export interface EmbeddedArticle {
  id: string;
  embedding: number[];
  entityKeys: string[];
}

export interface Cluster {
  articleIds: string[];
}

// Greedy single-link clustering: an article joins the first existing
// cluster where it's similar enough to ANY member; otherwise it starts
// a new cluster. "Similar enough" is now two-tiered: cosine >= highThreshold
// merges unconditionally, but cosine in [midThreshold, highThreshold) only
// merges when the pair also shares at least one entity key — this catches
// same-event coverage that embeds a bit lower (notably cross-language pairs)
// without a blanket threshold drop's false-merge risk.
export function clusterBySimilarity(
  articles: EmbeddedArticle[],
  highThreshold: number,
  midThreshold: number
): Cluster[] {
  const clusters: EmbeddedArticle[][] = [];

  for (const article of articles) {
    let placed = false;
    for (const cluster of clusters) {
      const matches = cluster.some((existing) => {
        const sim = cosineSimilarity(existing.embedding, article.embedding);
        if (sim >= highThreshold) return true;
        return sim >= midThreshold && overlapCount(existing.entityKeys, article.entityKeys) >= 1;
      });
      if (matches) {
        cluster.push(article);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push([article]);
    }
  }

  return clusters.map((c) => ({ articleIds: c.map((a) => a.id) }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest scripts/cluster/similarity.test.ts`
Expected: PASS (10/10).

- [ ] **Step 5: Commit**

```bash
git add scripts/cluster/similarity.ts scripts/cluster/similarity.test.ts
git commit -m "feat: add entity-guarded mid threshold to clusterBySimilarity"
```

---

### Task 3: Migration — `articles.entity_keys`

**Files:**
- Create: `supabase/migrations/0009_article_entity_keys.sql`

**Interfaces:**
- Produces: `articles.entity_keys text[]` (nullable), consumed by Task 4.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0009_article_entity_keys.sql`:

```sql
alter table articles
  add column entity_keys text[];
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the `mcp__supabase__apply_migration` tool with:
- `name`: `article_entity_keys`
- `query`: the SQL above.

This follows the project's established pattern (`0006`–`0008` were applied the same way via the Supabase MCP connector, not run locally).

- [ ] **Step 3: Verify**

Use `mcp__supabase__list_tables` (or `execute_sql` with `select column_name from information_schema.columns where table_name = 'articles'`) to confirm `entity_keys` now exists on `articles`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_article_entity_keys.sql
git commit -m "feat: add articles.entity_keys column"
```

---

### Task 4: Wire entity keys through `clusterStories.ts`

**Files:**
- Modify: `scripts/cluster/clusterStories.ts`
- Test: `scripts/cluster/clusterStories.test.ts`

**Interfaces:**
- Consumes: `extractEntityKeys` from `../../lib/entities` (Task 1), `EmbeddedArticle`/`clusterBySimilarity(articles, high, mid)` from `./similarity` (Task 2), `articles.entity_keys` column (Task 3).
- Produces: no change to `clusterUnclusteredArticles`'s public signature or `ClusterRunResult`.

- [ ] **Step 1: Write the failing tests**

In `scripts/cluster/clusterStories.test.ts`, add a second mid-band embedding constant near the existing `ANCHOR_EMBEDDING`/`SIMILAR_EMBEDDING`/`DIFFERENT_EMBEDDING` block:

```ts
const MID_BAND_EMBEDDING = [0.8, 0.6, 0]; // cosine vs ANCHOR_EMBEDDING = 0.8, inside [0.78, 0.86)
```

Then add these two tests inside the `describe("clusterUnclusteredArticles", ...)` block (anywhere after the existing "assigns a new article..." test):

```ts
  it("merges into an existing story on mid-band similarity when entity keys overlap", async () => {
    const { client, embedFn, queries } = scenario({
      unclustered: [{ id: "new-1", title: "UP Govt Extends Scheme To 60 Women", snippet: "s" }],
      anchors: [
        {
          id: "anchor-1",
          story_id: "story-existing",
          embedding: asPgVector(ANCHOR_EMBEDDING),
          entity_keys: ["up", "60"],
        },
      ],
      embedding: MID_BAND_EMBEDDING,
    });

    const result = await clusterUnclusteredArticles(client, embedFn);

    expect(storyAssignments(queries)).toEqual([
      { payload: { story_id: "story-existing" }, ids: ["new-1"] },
    ]);
    expect(result.articlesMergedIntoExisting).toBe(1);
  });

  it("does not merge on mid-band similarity when entity keys don't overlap", async () => {
    const { client, embedFn, queries } = scenario({
      unclustered: [{ id: "new-1", title: "Mumbai Metro Announces New Route", snippet: "s" }],
      anchors: [
        {
          id: "anchor-1",
          story_id: "story-existing",
          embedding: asPgVector(ANCHOR_EMBEDDING),
          entity_keys: ["up", "60"],
        },
      ],
      embedding: MID_BAND_EMBEDDING,
    });

    const result = await clusterUnclusteredArticles(client, embedFn);

    expect(storyInserts(queries)).toHaveLength(1);
    expect(result.clustersCreated).toBe(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest scripts/cluster/clusterStories.test.ts`
Expected: FAIL — the current single-threshold `clusterBySimilarity` call merges purely on cosine, so the "does not merge... don't overlap" test fails (cosine 0.8 alone isn't enough to fail today since the constant is still 0.86 either way — the real failure mode is a TypeScript error once Task 2's signature change lands, since `clusterStories.ts` still calls the old single-argument form). Confirm the failure is the expected mismatch (compile error or wrong merge behavior), not something unrelated.

- [ ] **Step 3: Update `scripts/cluster/clusterStories.ts`**

Add the import at the top (after the existing `similarity` import):

```ts
import { extractEntityKeys } from "../../lib/entities";
```

Replace the threshold constant:

```ts
const SIMILARITY_THRESHOLD = 0.86;
```

with:

```ts
const SIMILARITY_THRESHOLD_HIGH = 0.86;
const SIMILARITY_THRESHOLD_MID = 0.78;
```

In the embed loop (the `for (const article of articles as UnclusteredArticle[])` block), after a successful `embedFn` call, compute entity keys and include them in both the in-memory array and the persisted write:

```ts
    let embedding: number[];
    try {
      embedding = await embedFn(`${article.title}\n${article.snippet ?? ""}`);
    } catch (err) {
      embedFailures += 1;
      console.error(
        `Failed to embed article ${article.id}:`,
        err instanceof Error ? err.message : err
      );
      continue;
    }
    const entityKeys = extractEntityKeys(article.title);
    newEmbedded.push({ id: article.id, embedding, entityKeys });

    const { error: embeddingWriteError } = await supabase
      .from("articles")
      .update({ embedding, entity_keys: entityKeys })
      .eq("id", article.id);
```

(This replaces the existing `newEmbedded.push({ id: article.id, embedding })` line and the existing `.update({ embedding })` call — same call site, extended payload.)

Update the anchor query to also select `entity_keys`:

```ts
      .select("id, story_id, embedding, entity_keys")
```

Update the anchor row type and parsing loop. Change:

```ts
  const anchorRows: { id: string; story_id: string; embedding: unknown }[] = [];
```

to:

```ts
  const anchorRows: { id: string; story_id: string; embedding: unknown; entity_keys: unknown }[] = [];
```

and change the anchor-processing loop body from:

```ts
  for (const row of anchorRows as { id: string; story_id: string; embedding: unknown }[]) {
    const embedding = parseEmbedding(row.embedding);
    // cosineSimilarity throws on a length mismatch, so drop anything that
    // isn't the current embedding dimension rather than killing the run.
    if (!embedding || embedding.length !== expectedDim || !row.story_id) continue;
    anchorStoryById.set(row.id, row.story_id);
    anchorEmbedded.push({ id: row.id, embedding });
  }
```

to:

```ts
  for (const row of anchorRows) {
    const embedding = parseEmbedding(row.embedding);
    // cosineSimilarity throws on a length mismatch, so drop anything that
    // isn't the current embedding dimension rather than killing the run.
    if (!embedding || embedding.length !== expectedDim || !row.story_id) continue;
    const entityKeys = Array.isArray(row.entity_keys) ? (row.entity_keys as string[]) : [];
    anchorStoryById.set(row.id, row.story_id);
    anchorEmbedded.push({ id: row.id, embedding, entityKeys });
  }
```

Finally, update the clustering call:

```ts
  const clusters = clusterBySimilarity(
    [...anchorEmbedded, ...newEmbedded],
    SIMILARITY_THRESHOLD_HIGH,
    SIMILARITY_THRESHOLD_MID
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest scripts/cluster/clusterStories.test.ts`
Expected: PASS (all existing tests plus the 2 new ones).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/cluster/clusterStories.ts scripts/cluster/clusterStories.test.ts
git commit -m "feat: entity-guard mid-threshold clustering in clusterUnclusteredArticles"
```

---

### Task 5: Migration — storylines table

**Files:**
- Create: `supabase/migrations/0010_storylines.sql`

**Interfaces:**
- Produces: `storylines(id, title, created_at)`, `stories.storyline_id`, `stories.pooled_embedding`, `stories.entity_keys` — consumed by Task 6.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0010_storylines.sql`:

```sql
create table storylines (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz not null default now()
);

alter table stories
  add column storyline_id uuid references storylines(id),
  add column pooled_embedding vector(768),
  add column entity_keys text[];
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the `mcp__supabase__apply_migration` tool with:
- `name`: `storylines`
- `query`: the SQL above.

- [ ] **Step 3: Verify**

Use `mcp__supabase__list_tables` to confirm the new `storylines` table exists and `stories` now has `storyline_id`, `pooled_embedding`, `entity_keys`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_storylines.sql
git commit -m "feat: add storylines table and stories.storyline_id/pooled_embedding/entity_keys"
```

---

### Task 6: `assignStorylines`

**Files:**
- Create: `scripts/cluster/assignStorylines.ts`
- Test: `scripts/cluster/assignStorylines.test.ts`

**Interfaces:**
- Consumes: `parseEmbedding` from `./clusterStories` (already exported), `cosineSimilarity`/`overlapCount` from `./similarity` (Task 2), the `storylines`/`stories.storyline_id`/`stories.pooled_embedding`/`stories.entity_keys` schema (Task 5). Does **not** call `extractEntityKeys` directly — it only pools entity keys already cached on `articles.entity_keys` by Task 4.
- Produces: `assignStorylines(supabase: SupabaseClient): Promise<{ storiesAssigned: number; storylinesCreated: number }>`, consumed by Task 7.

- [ ] **Step 1: Write the failing tests**

Create `scripts/cluster/assignStorylines.test.ts`:

```ts
import { assignStorylines } from "./assignStorylines";

interface Call {
  method: string;
  args: any[];
}

interface Query {
  table: string;
  calls: Call[];
}

const CHAIN_METHODS = [
  "select", "insert", "update", "is", "not", "eq", "gte", "in", "order", "limit", "single",
];

function has(calls: Call[], method: string, ...args: any[]): boolean {
  return calls.some(
    (c) => c.method === method && args.every((a, i) => JSON.stringify(c.args[i]) === JSON.stringify(a))
  );
}

function payloadOf(calls: Call[]): any {
  return calls.find((c) => c.method === "update" || c.method === "insert")?.args[0];
}

/** Same chainable/thenable mock style as clusterStories.test.ts. */
function makeMockSupabase(resolve: (q: Query) => any) {
  const queries: Query[] = [];
  const from = jest.fn((table: string) => {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const builder: any = {};
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: any[]) => {
        query.calls.push({ method, args });
        return builder;
      };
    }
    builder.then = (onFulfilled: any, onRejected: any) =>
      Promise.resolve(resolve(query)).then(onFulfilled, onRejected);
    return builder;
  });
  return { client: { from } as any, queries };
}

const asPgVector = (v: number[]) => JSON.stringify(v);

const CANDIDATE_EMBEDDING = [0.8, 0.6];
const REP_MATCH_EMBEDDING = [1, 0]; // cosine vs candidate = 0.8 (>= 0.65)
const REP_LOW_COSINE_EMBEDDING = [0, 1]; // cosine vs candidate = 0.6 (< 0.65)

const CANDIDATE = {
  id: "story-candidate",
  canonical_headline: "UP Launches Aadhaar Link For Bus Scheme",
  pooled_embedding: asPgVector(CANDIDATE_EMBEDDING),
  entity_keys: ["up", "aadhaar", "bus", "scheme"],
};

interface ScenarioOptions {
  candidates?: any[];
  openRows?: any[];
  storylineTitle?: string | null;
  articles?: any[];
}

function scenario(opts: ScenarioOptions = {}) {
  const candidates = opts.candidates ?? [CANDIDATE];
  const openRows = opts.openRows ?? [];
  const articles = opts.articles ?? [];
  const assignments: { table: string; payload: any; id: any }[] = [];
  const inserts: any[] = [];

  const mock = makeMockSupabase((q) => {
    if (q.table === "stories" && has(q.calls, "is", "storyline_id", null)) {
      return { data: candidates, error: null };
    }
    if (q.table === "stories" && has(q.calls, "not", "storyline_id", "is", null)) {
      return { data: openRows, error: null };
    }
    if (q.table === "stories" && has(q.calls, "update")) {
      const payload = payloadOf(q.calls);
      const idCall = q.calls.find((c) => c.method === "eq");
      assignments.push({ table: "stories", payload, id: idCall?.args[1] });
      return { data: null, error: null };
    }
    if (q.table === "articles") {
      return { data: articles, error: null }; // only populated by the pooling test below
    }
    if (q.table === "storylines" && has(q.calls, "single") && !has(q.calls, "insert")) {
      return { data: { title: opts.storylineTitle ?? "Existing storyline title" }, error: null };
    }
    if (q.table === "storylines" && has(q.calls, "insert")) {
      const payload = payloadOf(q.calls);
      inserts.push(payload);
      return { data: { id: "storyline-new" }, error: null };
    }
    if (q.table === "storylines" && has(q.calls, "update")) {
      const payload = payloadOf(q.calls);
      assignments.push({ table: "storylines", payload, id: q.calls.find((c) => c.method === "eq")?.args[1] });
      return { data: null, error: null };
    }
    throw new Error(`unexpected query: ${JSON.stringify(q)}`);
  });

  return { ...mock, assignments, inserts };
}

describe("assignStorylines", () => {
  it("creates a new storyline when there is no open match", async () => {
    const { client, inserts, assignments } = scenario({ openRows: [] });

    const result = await assignStorylines(client);

    expect(inserts).toEqual([{ title: CANDIDATE.canonical_headline }]);
    expect(assignments).toContainEqual({
      table: "stories",
      payload: { storyline_id: "storyline-new" },
      id: CANDIDATE.id,
    });
    expect(result).toEqual({ storiesAssigned: 1, storylinesCreated: 1 });
  });

  it("matches into an existing open storyline when cosine and entity overlap both pass", async () => {
    const openRows = [
      {
        storyline_id: "storyline-open",
        pooled_embedding: asPgVector(REP_MATCH_EMBEDDING),
        entity_keys: ["up", "bus", "scheme", "women"], // overlap with candidate: up, bus, scheme = 3
        created_at: new Date().toISOString(),
      },
    ];
    const { client, inserts, assignments } = scenario({ openRows });

    const result = await assignStorylines(client);

    expect(inserts).toHaveLength(0);
    expect(assignments).toContainEqual({
      table: "stories",
      payload: { storyline_id: "storyline-open" },
      id: CANDIDATE.id,
    });
    expect(result).toEqual({ storiesAssigned: 1, storylinesCreated: 0 });
  });

  it("falls back to a new storyline when cosine passes but entity overlap is too low", async () => {
    const openRows = [
      {
        storyline_id: "storyline-open",
        pooled_embedding: asPgVector(REP_MATCH_EMBEDDING), // cosine 0.8, passes
        entity_keys: ["mumbai", "metro"], // overlap with candidate: 0, fails (need >= 2)
        created_at: new Date().toISOString(),
      },
    ];
    const { client, inserts } = scenario({ openRows });

    const result = await assignStorylines(client);

    expect(inserts).toEqual([{ title: CANDIDATE.canonical_headline }]);
    expect(result.storylinesCreated).toBe(1);
  });

  it("falls back to a new storyline when entity overlap passes but cosine is too low", async () => {
    const openRows = [
      {
        storyline_id: "storyline-open",
        pooled_embedding: asPgVector(REP_LOW_COSINE_EMBEDDING), // cosine 0.6, fails (need >= 0.65)
        entity_keys: ["up", "bus", "scheme"], // overlap 3, passes
        created_at: new Date().toISOString(),
      },
    ];
    const { client, inserts } = scenario({ openRows });

    const result = await assignStorylines(client);

    expect(inserts).toEqual([{ title: CANDIDATE.canonical_headline }]);
    expect(result.storylinesCreated).toBe(1);
  });

  it("backfills a null storyline title from the matched candidate's headline", async () => {
    const openRows = [
      {
        storyline_id: "storyline-open",
        pooled_embedding: asPgVector(REP_MATCH_EMBEDDING),
        entity_keys: ["up", "bus", "scheme"],
        created_at: new Date().toISOString(),
      },
    ];
    const { client, assignments } = scenario({ openRows, storylineTitle: null });

    await assignStorylines(client);

    expect(assignments).toContainEqual({
      table: "storylines",
      payload: { title: CANDIDATE.canonical_headline },
      id: "storyline-open",
    });
  });

  it("computes the open-storyline lookup window as roughly 240 hours back", async () => {
    const before = Date.now();
    const { client, queries } = scenario({ openRows: [] });

    await assignStorylines(client);

    const openQuery = queries.find(
      (q) => q.table === "stories" && has(q.calls, "not", "storyline_id", "is", null)
    )!;
    const gteCall = openQuery.calls.find((c) => c.method === "gte")!;
    const cutoffMs = new Date(gteCall.args[1]).getTime();
    const expectedCutoffMs = before - 240 * 60 * 60 * 1000; // STORYLINE_WINDOW_HOURS
    expect(Math.abs(cutoffMs - expectedCutoffMs)).toBeLessThan(5000);
  });

  it("pools embedding and entity keys from member articles when not yet cached", async () => {
    const uncached = {
      id: "story-uncached",
      canonical_headline: "Fresh Story With No Cache Yet",
      pooled_embedding: null,
      entity_keys: null,
    };
    const { client, queries } = scenario({
      candidates: [uncached],
      openRows: [],
      articles: [
        { embedding: asPgVector([1, 0]), entity_keys: ["a"] },
        { embedding: asPgVector([0, 1]), entity_keys: ["b"] },
      ],
    });

    const result = await assignStorylines(client);

    const cacheWrite = queries.find(
      (q) => q.table === "stories" && has(q.calls, "update") && "pooled_embedding" in payloadOf(q.calls)
    );
    expect(cacheWrite).toBeDefined();
    const payload = payloadOf(cacheWrite!.calls);
    expect(payload.pooled_embedding).toEqual([0.5, 0.5]);
    expect(payload.entity_keys.sort()).toEqual(["a", "b"]);
    expect(result.storiesAssigned).toBe(1);
    expect(result.storylinesCreated).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest scripts/cluster/assignStorylines.test.ts`
Expected: FAIL with "Cannot find module './assignStorylines'".

- [ ] **Step 3: Implement `scripts/cluster/assignStorylines.ts`**

```ts
import { SupabaseClient } from "@supabase/supabase-js";
import { parseEmbedding } from "./clusterStories";
import { cosineSimilarity, overlapCount } from "./similarity";

// How many storyline-less headlined stories to consider per run. Not time-
// windowed by created_at (unlike the article clusterer's candidate window):
// ~17.9k stories already have canonical_headline set and predate this
// feature, so a recency window would permanently exclude the entire
// backlog. Capping by batch size instead lets the backlog clear
// progressively (oldest first) across successive 2h cron ticks.
const STORYLINE_CANDIDATE_BATCH_SIZE = 500;

// A storyline is "open" (eligible to receive a new story) if its most
// recently created member story falls within this window. 240h (10 days)
// matches the observed real-world span of the diagnosed example storyline.
const STORYLINE_WINDOW_HOURS = 240;

// Looser than the clusterer's mid threshold (0.78): storyline members are
// related-but-distinct events (an announcement vs. a follow-up detail), not
// the same event reworded, so they're expected to run less similar.
const STORYLINE_SIM_THRESHOLD = 0.65;

// Stricter than the clusterer's entity floor (1): compensates for the
// looser cosine bound above so two stories aren't grouped on one generic
// shared token (e.g. a state abbreviation appearing in many unrelated
// stories).
const STORYLINE_ENTITY_MIN = 2;

interface PooledFields {
  embedding: number[];
  entityKeys: string[];
}

interface CandidateRow {
  id: string;
  canonical_headline: string;
  pooled_embedding: unknown;
  entity_keys: unknown;
}

export interface AssignStorylinesResult {
  storiesAssigned: number;
  storylinesCreated: number;
}

function toEntityKeys(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/** Mean-pools a story's member articles' embeddings and unions their entity keys. */
async function computePooledFields(
  supabase: SupabaseClient,
  storyId: string
): Promise<PooledFields | null> {
  const { data: articles, error } = await supabase
    .from("articles")
    .select("embedding, entity_keys")
    .eq("story_id", storyId)
    .not("embedding", "is", null);
  if (error) {
    console.error(`Failed to fetch articles for story ${storyId}: ${error.message}`);
    return null;
  }
  if (!articles || articles.length === 0) return null;

  const embeddings: number[][] = [];
  const entityKeySet = new Set<string>();
  for (const row of articles as { embedding: unknown; entity_keys: unknown }[]) {
    const embedding = parseEmbedding(row.embedding);
    if (embedding) embeddings.push(embedding);
    for (const key of toEntityKeys(row.entity_keys)) entityKeySet.add(key);
  }
  if (embeddings.length === 0) return null;

  const dim = embeddings[0].length;
  const mean = new Array(dim).fill(0);
  for (const embedding of embeddings) {
    if (embedding.length !== dim) continue;
    for (let i = 0; i < dim; i++) mean[i] += embedding[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= embeddings.length;

  return { embedding: mean, entityKeys: [...entityKeySet] };
}

export async function assignStorylines(supabase: SupabaseClient): Promise<AssignStorylinesResult> {
  const empty: AssignStorylinesResult = { storiesAssigned: 0, storylinesCreated: 0 };

  const { data: candidates, error: candidatesError } = await supabase
    .from("stories")
    .select("id, canonical_headline, pooled_embedding, entity_keys")
    .is("storyline_id", null)
    .not("canonical_headline", "is", null)
    .order("created_at", { ascending: true })
    .limit(STORYLINE_CANDIDATE_BATCH_SIZE);
  if (candidatesError) {
    throw new Error(`Failed to fetch storyline candidates: ${candidatesError.message}`);
  }
  if (!candidates || candidates.length === 0) return empty;

  const openCutoff = new Date(Date.now() - STORYLINE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: openRows, error: openError } = await supabase
    .from("stories")
    .select("storyline_id, pooled_embedding, entity_keys, created_at")
    .not("storyline_id", "is", null)
    .gte("created_at", openCutoff)
    .order("created_at", { ascending: false });
  if (openError) {
    throw new Error(`Failed to fetch open storylines: ${openError.message}`);
  }

  // Rows arrive most-recent-first, so the first row seen per storyline_id is
  // that storyline's representative (its latest member story).
  const representatives = new Map<string, PooledFields>();
  for (const row of (openRows ?? []) as {
    storyline_id: string;
    pooled_embedding: unknown;
    entity_keys: unknown;
  }[]) {
    if (representatives.has(row.storyline_id)) continue;
    const embedding = parseEmbedding(row.pooled_embedding);
    if (!embedding) continue;
    representatives.set(row.storyline_id, { embedding, entityKeys: toEntityKeys(row.entity_keys) });
  }

  let storiesAssigned = 0;
  let storylinesCreated = 0;

  for (const candidate of candidates as CandidateRow[]) {
    let pooled: PooledFields | null = null;
    const cachedEmbedding = parseEmbedding(candidate.pooled_embedding);
    if (cachedEmbedding) {
      pooled = { embedding: cachedEmbedding, entityKeys: toEntityKeys(candidate.entity_keys) };
    } else {
      pooled = await computePooledFields(supabase, candidate.id);
      if (!pooled) continue; // no embedded articles yet; retry next run
      const { error: cacheError } = await supabase
        .from("stories")
        .update({ pooled_embedding: pooled.embedding, entity_keys: pooled.entityKeys })
        .eq("id", candidate.id);
      if (cacheError) {
        console.error(`Failed to cache pooled fields for story ${candidate.id}: ${cacheError.message}`);
      }
    }

    let bestMatch: string | null = null;
    let bestSim = -1;
    for (const [storylineId, rep] of representatives) {
      if (rep.embedding.length !== pooled.embedding.length) continue;
      const sim = cosineSimilarity(rep.embedding, pooled.embedding);
      if (sim < STORYLINE_SIM_THRESHOLD) continue;
      if (overlapCount(rep.entityKeys, pooled.entityKeys) < STORYLINE_ENTITY_MIN) continue;
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = storylineId;
      }
    }

    if (bestMatch) {
      const { data: storylineRow } = await supabase
        .from("storylines")
        .select("title")
        .eq("id", bestMatch)
        .single();
      if (storylineRow && storylineRow.title == null) {
        const { error: titleError } = await supabase
          .from("storylines")
          .update({ title: candidate.canonical_headline })
          .eq("id", bestMatch);
        if (titleError) {
          console.error(`Failed to backfill title for storyline ${bestMatch}: ${titleError.message}`);
        }
      }

      const { error: assignError } = await supabase
        .from("stories")
        .update({ storyline_id: bestMatch })
        .eq("id", candidate.id);
      if (assignError) {
        console.error(`Failed to assign story ${candidate.id} to storyline ${bestMatch}: ${assignError.message}`);
        continue;
      }
      storiesAssigned += 1;
      continue;
    }

    const { data: storyline, error: insertError } = await supabase
      .from("storylines")
      .insert({ title: candidate.canonical_headline })
      .select("id")
      .single();
    if (insertError || !storyline) {
      console.error(`Failed to create storyline for story ${candidate.id}: ${insertError?.message}`);
      continue;
    }
    const { error: assignError } = await supabase
      .from("stories")
      .update({ storyline_id: storyline.id })
      .eq("id", candidate.id);
    if (assignError) {
      console.error(`Failed to assign story ${candidate.id} to new storyline ${storyline.id}: ${assignError.message}`);
      continue;
    }
    representatives.set(storyline.id, pooled);
    storiesAssigned += 1;
    storylinesCreated += 1;
  }

  return { storiesAssigned, storylinesCreated };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest scripts/cluster/assignStorylines.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/cluster/assignStorylines.ts scripts/cluster/assignStorylines.test.ts
git commit -m "feat: add assignStorylines pass for grouping related stories over time"
```

---

### Task 7: Wire `assignStorylines` into the cron pipeline

**Files:**
- Modify: `scripts/cluster/run.ts`

**Interfaces:**
- Consumes: `assignStorylines(supabase)` from Task 6.

- [ ] **Step 1: Update `scripts/cluster/run.ts`**

Add the import (after the existing `flagStoryConflicts` import):

```ts
import { assignStorylines } from "./assignStorylines";
```

Add this block at the end of `main()`, after the `fillMissingHeadlines` call and its `console.log`:

```ts
  // Storyline assignment needs canonical_headline (to title a newly-founded
  // storyline), so it runs after headline generation. Same non-fatal
  // tolerance as conflict flagging above — this is an enhancement layered on
  // the core pipeline, not something that should ever fail the run.
  try {
    const { storiesAssigned, storylinesCreated } = await assignStorylines(supabase);
    console.log(
      `Assigned ${storiesAssigned} storie(s) to storylines, ${storylinesCreated} new storyline(s) created.`
    );
  } catch (err) {
    console.error(
      "Failed to assign storylines; continuing:",
      err instanceof Error ? err.message : err
    );
  }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all suites PASS (there's no dedicated `run.test.ts` — `run.ts` is a thin orchestration script covered by its callees' own tests, matching the existing convention that `clusterStories`/`fillMissingHeadlines`/`flagStoryConflicts` are unit-tested but `run.ts`'s wiring is not).

- [ ] **Step 4: Commit**

```bash
git add scripts/cluster/run.ts
git commit -m "feat: wire assignStorylines into the cluster cron pipeline"
```

---

## Post-Plan Notes (do not implement — for the finishing-a-development-branch step)

- Both migrations (`0009`, `0010`) must be applied to prod **before** merging to master, matching the established critical-merge-gate pattern (the `ingest.yml` 2h cron runs this pipeline from the default branch; a missing column would break the run on the next tick).
- The spec's flagged open item stands: `STORYLINE_SIM_THRESHOLD`/`STORYLINE_ENTITY_MIN` are unvalidated first-cut estimates. Once a few days of post-ship data exist, a diagnostic sample (same method as the original clustering-threshold diagnosis) should check whether real storylines are forming correctly.
- UI surfacing of storylines is explicitly out of scope for this plan (spec §5) and is a separate future brainstorm/plan.
