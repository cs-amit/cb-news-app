import { matchFactChecksToStories } from "./matchFactChecks";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "update", "is", "gte", "not", "eq", "order", "limit"];

function makeMockSupabase(resolve: (q: Query) => { data: any; error: any }) {
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
    builder.then = (onFulfilled: any) => Promise.resolve(resolve(query)).then(onFulfilled);
    return builder;
  });
  return { client: { from } as any, queries };
}

describe("matchFactChecksToStories", () => {
  it("matches an unmatched fact-check to the most similar recent story above the threshold", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "fact_checks" && q.calls.some((c) => c.method === "is")) {
        return { data: [{ id: "fc-1", claim: "Claim text" }], error: null };
      }
      if (q.table === "stories") {
        return {
          data: [
            { id: "story-1", canonical_headline: "H1", summary: "S1" },
            { id: "story-2", canonical_headline: "H2", summary: "S2" },
          ],
          error: null,
        };
      }
      if (q.table === "fact_checks" && q.calls.some((c) => c.method === "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const embedFn = jest
      .fn()
      .mockResolvedValueOnce([1, 0]) // fact-check claim embedding
      .mockResolvedValueOnce([1, 0]) // story-1 embedding — identical, similarity 1
      .mockResolvedValueOnce([0, 1]); // story-2 embedding — orthogonal, similarity 0

    const matched = await matchFactChecksToStories(client, embedFn, 0.8);

    expect(matched).toBe(1);
    const updateQuery = queries.find(
      (q) => q.table === "fact_checks" && q.calls.some((c) => c.method === "update")
    )!;
    const updateCall = updateQuery.calls.find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({ matched_story_id: "story-1" });
  });

  it("leaves a fact-check unmatched when nothing clears the similarity threshold", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "fact_checks" && q.calls.some((c) => c.method === "is")) {
        return { data: [{ id: "fc-1", claim: "Claim text" }], error: null };
      }
      if (q.table === "stories") {
        return { data: [{ id: "story-1", canonical_headline: "H1", summary: "S1" }], error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const embedFn = jest.fn().mockResolvedValueOnce([1, 0]).mockResolvedValueOnce([0, 1]);

    const matched = await matchFactChecksToStories(client, embedFn, 0.8);

    expect(matched).toBe(0);
    expect(queries.filter((q) => q.table === "fact_checks" && q.calls.some((c) => c.method === "update"))).toHaveLength(0);
  });

  it("orders the unmatched-fact-check query deterministically with a recency floor", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "fact_checks" && q.calls.some((c) => c.method === "is")) {
        return { data: [], error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    await matchFactChecksToStories(client, jest.fn(), 0.8);

    const unmatchedQuery = queries.find((q) => q.table === "fact_checks")!;
    const orderCalls = unmatchedQuery.calls.filter((c) => c.method === "order").map((c) => c.args);
    expect(orderCalls).toEqual([
      ["published_at", { ascending: false }],
      ["id"],
    ]);
    expect(unmatchedQuery.calls.some((c) => c.method === "gte" && c.args[0] === "published_at")).toBe(
      true
    );
  });

  it("returns 0 without embedding anything when there are no unmatched fact-checks", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "fact_checks") return { data: [], error: null };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const embedFn = jest.fn();
    expect(await matchFactChecksToStories(client, embedFn, 0.8)).toBe(0);
    expect(embedFn).not.toHaveBeenCalled();
  });
});
