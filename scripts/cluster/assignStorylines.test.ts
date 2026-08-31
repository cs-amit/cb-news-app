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
      return {
        data: { title: opts.storylineTitle === undefined ? "Existing storyline title" : opts.storylineTitle },
        error: null,
      };
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
