import { findMoreSources } from "./findMoreSources";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "update", "upsert", "not", "eq", "lte", "is", "in", "order", "limit"];

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

describe("findMoreSources", () => {
  it("discovers a relevant candidate and stamps the story as checked", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "stories" && q.calls.some((c) => c.method === "limit")) {
        return {
          data: [{ id: "story-1", canonical_headline: "Building collapse", founder_article_id: "art-1" }],
          error: null,
        };
      }
      if (q.table === "articles") {
        return { data: [{ id: "art-1", embedding: [1, 0] }], error: null };
      }
      if (q.table === "discovered_articles") {
        return { data: null, error: null };
      }
      if (q.table === "stories" && q.calls.some((c) => c.method === "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const searchFn = jest.fn().mockResolvedValue([
      { title: "Another outlet covers the collapse", url: "https://other.com/a", outletName: "Other", publishedAt: null },
    ]);
    const embedFn = jest.fn().mockResolvedValue([1, 0]); // identical to founder -> similarity 1

    const result = await findMoreSources(client, searchFn, embedFn, 0.86);

    expect(result).toEqual({ checked: 1, discovered: 1 });
    expect(searchFn).toHaveBeenCalledWith("Building collapse");

    const upsertQuery = queries.find((q) => q.table === "discovered_articles")!;
    const upsertCall = upsertQuery.calls.find((c) => c.method === "upsert")!;
    expect(upsertCall.args[0]).toEqual({
      story_id: "story-1",
      outlet_name: "Other",
      url: "https://other.com/a",
      title: "Another outlet covers the collapse",
      published_at: null,
      similarity: 1,
    });

    const stampQuery = queries.find((q) => q.table === "stories" && q.calls.some((c) => c.method === "update"))!;
    expect(stampQuery.calls.find((c) => c.method === "update")!.args[0]).toEqual({
      source_discovery_checked_at: expect.any(String),
    });
  });

  it("discards a candidate below the similarity threshold and still stamps checked", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "stories" && q.calls.some((c) => c.method === "limit")) {
        return {
          data: [{ id: "story-1", canonical_headline: "H", founder_article_id: "art-1" }],
          error: null,
        };
      }
      if (q.table === "articles") {
        return { data: [{ id: "art-1", embedding: [1, 0] }], error: null };
      }
      if (q.table === "stories" && q.calls.some((c) => c.method === "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const searchFn = jest
      .fn()
      .mockResolvedValue([{ title: "Unrelated story", url: "https://other.com/b", outletName: "Other", publishedAt: null }]);
    const embedFn = jest.fn().mockResolvedValue([0, 1]); // orthogonal -> similarity 0

    const result = await findMoreSources(client, searchFn, embedFn, 0.86);

    expect(result).toEqual({ checked: 1, discovered: 0 });
    expect(queries.some((q) => q.table === "discovered_articles")).toBe(false);
  });

  it("does not stamp checked when the search call fails (retry next run)", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "stories" && q.calls.some((c) => c.method === "limit")) {
        return {
          data: [{ id: "story-1", canonical_headline: "H", founder_article_id: "art-1" }],
          error: null,
        };
      }
      if (q.table === "articles") {
        return { data: [{ id: "art-1", embedding: [1, 0] }], error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const searchFn = jest.fn().mockRejectedValue(new Error("network error"));
    const embedFn = jest.fn();

    const result = await findMoreSources(client, searchFn, embedFn, 0.86);

    expect(result).toEqual({ checked: 0, discovered: 0 });
    expect(queries.some((q) => q.table === "stories" && q.calls.some((c) => c.method === "update"))).toBe(false);
  });

  it("skips a story with no founder embedding without stamping it checked", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "stories" && q.calls.some((c) => c.method === "limit")) {
        return { data: [{ id: "story-1", canonical_headline: "H", founder_article_id: null }], error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const searchFn = jest.fn();
    const embedFn = jest.fn();

    const result = await findMoreSources(client, searchFn, embedFn, 0.86);

    expect(result).toEqual({ checked: 0, discovered: 0 });
    expect(searchFn).not.toHaveBeenCalled();
  });

  it("returns zeros when there are no eligible stories", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && q.calls.some((c) => c.method === "limit")) {
        return { data: [], error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const result = await findMoreSources(client, jest.fn(), jest.fn(), 0.86);
    expect(result).toEqual({ checked: 0, discovered: 0 });
  });
});
