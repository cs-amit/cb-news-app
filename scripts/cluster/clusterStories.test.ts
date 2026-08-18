import { clusterUnclusteredArticles, parseEmbedding } from "./clusterStories";

interface Call {
  method: string;
  args: any[];
}

interface Query {
  table: string;
  calls: Call[];
}

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "is",
  "not",
  "or",
  "gte",
  "eq",
  "in",
  "order",
  "limit",
  "range",
  "single",
];

function has(calls: Call[], method: string, ...args: any[]): boolean {
  return calls.some(
    (c) => c.method === method && args.every((a, i) => JSON.stringify(c.args[i]) === JSON.stringify(a))
  );
}

/**
 * Chainable, thenable Supabase mock in the style of the other tests in this
 * repo, but able to record whole query chains so we can assert on WHICH rows
 * were written where. `resolve` receives the finished chain and returns the
 * result the awaited query should produce.
 */
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

  return { client: { from } as any, from, queries };
}

const ANCHOR_EMBEDDING = [1, 0, 0];
const SIMILAR_EMBEDDING = [0.99, 0.14, 0]; // cosine vs anchor ~= 0.990
const DIFFERENT_EMBEDDING = [0, 1, 0]; // cosine vs anchor = 0

/** pgvector comes back from PostgREST as a JSON string, so mock it that way. */
const asPgVector = (v: number[]) => JSON.stringify(v);

interface ScenarioOptions {
  unclustered?: any[];
  anchors?: any[];
  embedding?: number[];
  embeddingWriteError?: { message: string } | null;
}

function scenario(opts: ScenarioOptions = {}) {
  const unclustered = opts.unclustered ?? [{ id: "new-1", title: "New coverage", snippet: "s" }];
  const anchors = opts.anchors ?? [
    { id: "anchor-1", story_id: "story-existing", embedding: asPgVector(ANCHOR_EMBEDDING) },
  ];

  const mock = makeMockSupabase((q) => {
    if (q.table === "stories") {
      return { data: { id: "story-new" }, error: null };
    }
    // articles ...
    if (has(q.calls, "update")) {
      const payload = q.calls.find((c) => c.method === "update")!.args[0];
      if ("embedding" in payload) {
        return { data: null, error: opts.embeddingWriteError ?? null };
      }
      return { data: null, error: null };
    }
    if (has(q.calls, "is", "story_id", null)) {
      return { data: unclustered, error: null };
    }
    if (has(q.calls, "not", "story_id", "is", null)) {
      return { data: anchors, error: null };
    }
    throw new Error(`unexpected query: ${JSON.stringify(q)}`);
  });

  const embedFn = jest.fn().mockResolvedValue(opts.embedding ?? SIMILAR_EMBEDDING);
  return { ...mock, embedFn };
}

/** The `update({ story_id })` chains that actually assigned articles. */
function storyAssignments(queries: Query[]) {
  return queries
    .filter((q) => q.table === "articles" && has(q.calls, "update"))
    .map((q) => ({
      payload: q.calls.find((c) => c.method === "update")!.args[0],
      ids: q.calls.find((c) => c.method === "in")?.args[1],
    }))
    .filter((u) => "story_id" in u.payload);
}

const storyInserts = (queries: Query[]) => queries.filter((q) => q.table === "stories");

describe("clusterUnclusteredArticles", () => {
  it("assigns a new article to an EXISTING story when it matches an anchor", async () => {
    const { client, embedFn, queries } = scenario();

    const result = await clusterUnclusteredArticles(client, embedFn);

    // The whole point of Fix 2: no new story row, article joins story-existing.
    expect(storyInserts(queries)).toHaveLength(0);
    expect(storyAssignments(queries)).toEqual([
      { payload: { story_id: "story-existing" }, ids: ["new-1"] },
    ]);
    expect(result).toEqual({
      clustersCreated: 0,
      articlesClustered: 1,
      articlesMergedIntoExisting: 1,
    });
  });

  it("creates a new story when no anchor is similar enough", async () => {
    const { client, embedFn, queries } = scenario({ embedding: DIFFERENT_EMBEDDING });

    const result = await clusterUnclusteredArticles(client, embedFn);

    expect(storyInserts(queries)).toHaveLength(1);
    expect(storyAssignments(queries)).toEqual([
      { payload: { story_id: "story-new" }, ids: ["new-1"] },
    ]);
    expect(result).toEqual({
      clustersCreated: 1,
      articlesClustered: 1,
      articlesMergedIntoExisting: 0,
    });
  });

  it("creates a new story when there are no anchors at all", async () => {
    const { client, embedFn, queries } = scenario({ anchors: [] });

    const result = await clusterUnclusteredArticles(client, embedFn);

    expect(storyInserts(queries)).toHaveLength(1);
    expect(result.clustersCreated).toBe(1);
    expect(result.articlesMergedIntoExisting).toBe(0);
  });

  it("never re-assigns the anchor article itself", async () => {
    const { client, embedFn, queries } = scenario();
    await clusterUnclusteredArticles(client, embedFn);
    for (const assignment of storyAssignments(queries)) {
      expect(assignment.ids).not.toContain("anchor-1");
    }
  });

  it("ignores anchors whose stored embedding has a different dimension", async () => {
    const { client, embedFn, queries } = scenario({
      anchors: [{ id: "anchor-1", story_id: "story-existing", embedding: asPgVector([1, 0]) }],
    });

    const result = await clusterUnclusteredArticles(client, embedFn);

    // Mismatched dimension would make cosineSimilarity throw; it must be
    // dropped instead, falling back to new-story creation.
    expect(result.clustersCreated).toBe(1);
    expect(storyInserts(queries)).toHaveLength(1);
  });

  it("includes articles with a null published_at in the unclustered fetch", async () => {
    const { client, embedFn, queries } = scenario();
    await clusterUnclusteredArticles(client, embedFn);

    const fetchQuery = queries.find((q) => has(q.calls, "is", "story_id", null))!;
    const orCall = fetchQuery.calls.find((c) => c.method === "or");
    expect(orCall).toBeDefined();
    expect(orCall!.args[0]).toMatch(/^published_at\.is\.null,published_at\.gte\./);
    expect(has(fetchQuery.calls, "gte")).toBe(false);
  });

  it("logs but does not throw when persisting an embedding fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { client, embedFn } = scenario({ embeddingWriteError: { message: "write denied" } });

    const result = await clusterUnclusteredArticles(client, embedFn);

    expect(result.articlesMergedIntoExisting).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("write denied"));
    errorSpy.mockRestore();
  });

  it("skips an article whose embedding call fails but still clusters the rest", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { client, embedFn, queries } = scenario({
      unclustered: [
        { id: "bad-1", title: "Bad", snippet: null },
        { id: "new-1", title: "Good", snippet: null },
      ],
    });
    embedFn
      .mockRejectedValueOnce(new Error("429 quota"))
      .mockResolvedValueOnce(SIMILAR_EMBEDDING);

    const result = await clusterUnclusteredArticles(client, embedFn);

    expect(result.articlesClustered).toBe(1);
    expect(storyAssignments(queries)).toEqual([
      { payload: { story_id: "story-existing" }, ids: ["new-1"] },
    ]);
    errorSpy.mockRestore();
  });

  it("throws when every embedding call fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { client, embedFn } = scenario();
    embedFn.mockRejectedValue(new Error("503 unavailable"));

    await expect(clusterUnclusteredArticles(client, embedFn)).rejects.toThrow(
      "embedding backend appears unavailable"
    );
    errorSpy.mockRestore();
  });

  it("returns zeroes without embedding anything when nothing needs clustering", async () => {
    const { client, embedFn } = scenario({ unclustered: [] });
    const result = await clusterUnclusteredArticles(client, embedFn);
    expect(result).toEqual({
      clustersCreated: 0,
      articlesClustered: 0,
      articlesMergedIntoExisting: 0,
    });
    expect(embedFn).not.toHaveBeenCalled();
  });

  it("pages through the full anchor set instead of stopping at the first page", async () => {
    const ANCHOR_PAGE_SIZE = 500;
    const page1 = Array.from({ length: ANCHOR_PAGE_SIZE }, (_, i) => ({
      id: `anchor-page1-${i}`,
      story_id: "story-existing",
      embedding: asPgVector(DIFFERENT_EMBEDDING),
    }));
    // Lives on page 2, past the OLD hard cap — only reachable if pagination works.
    const page2 = [
      { id: "anchor-page2-0", story_id: "story-old", embedding: asPgVector(ANCHOR_EMBEDDING) },
    ];

    const mock = makeMockSupabase((q) => {
      if (q.table === "stories") return { data: { id: "story-new" }, error: null };
      if (has(q.calls, "update")) return { data: null, error: null };
      if (has(q.calls, "is", "story_id", null)) {
        return { data: [{ id: "new-1", title: "New coverage", snippet: "s" }], error: null };
      }
      if (has(q.calls, "not", "story_id", "is", null)) {
        const rangeCall = q.calls.find((c) => c.method === "range")!;
        const [offset] = rangeCall.args;
        return { data: offset === 0 ? page1 : page2, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const embedFn = jest.fn().mockResolvedValue(ANCHOR_EMBEDDING);
    const result = await clusterUnclusteredArticles(mock.client, embedFn);

    expect(result.articlesMergedIntoExisting).toBe(1);
    const assignment = storyAssignments(mock.queries)[0];
    expect(assignment.payload).toEqual({ story_id: "story-old" });
  });

  it("warns but does not throw when the anchor set hits the safety ceiling", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const bigPage = () =>
      Array.from({ length: 500 }, (_, i) => ({
        id: `a-${i}`,
        story_id: "story-existing",
        embedding: asPgVector(DIFFERENT_EMBEDDING),
      }));

    const mock = makeMockSupabase((q) => {
      if (q.table === "stories") return { data: { id: "story-new" }, error: null };
      if (has(q.calls, "update")) return { data: null, error: null };
      if (has(q.calls, "is", "story_id", null)) {
        return { data: [{ id: "new-1", title: "New coverage", snippet: "s" }], error: null };
      }
      if (has(q.calls, "not", "story_id", "is", null)) {
        return { data: bigPage(), error: null }; // every page is full -> loops until ceiling
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const embedFn = jest.fn().mockResolvedValue(DIFFERENT_EMBEDDING);
    await clusterUnclusteredArticles(mock.client, embedFn);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("safety ceiling"));
    warnSpy.mockRestore();
  });
});

describe("parseEmbedding", () => {
  it("parses the JSON-string form pgvector returns over PostgREST", () => {
    expect(parseEmbedding("[0.1,-0.2,0.3]")).toEqual([0.1, -0.2, 0.3]);
  });

  it("passes through a plain number array", () => {
    expect(parseEmbedding([1, 2])).toEqual([1, 2]);
  });

  it("returns null for unusable values", () => {
    expect(parseEmbedding(null)).toBeNull();
    expect(parseEmbedding("not json")).toBeNull();
    expect(parseEmbedding('["a","b"]')).toBeNull();
  });
});
