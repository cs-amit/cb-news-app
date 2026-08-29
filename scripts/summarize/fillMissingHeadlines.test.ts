import { fillMissingHeadlines } from "./fillMissingHeadlines";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "update", "is", "eq", "order", "limit"];

function has(calls: Call[], method: string): boolean {
  return calls.some((c) => c.method === method);
}

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

describe("fillMissingHeadlines", () => {
  it("makes exactly one batched call for multiple headline-less stories", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: [{ id: "story-1" }, { id: "story-2" }], error: null };
      }
      if (q.table === "articles") {
        return { data: [{ title: "T", outlet: { name: "Outlet" } }], error: null };
      }
      if (q.table === "stories" && has(q.calls, "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const generateFn = jest.fn().mockResolvedValue(
      new Map([
        ["story-1", { headline: "H1", summary: "S1" }],
        ["story-2", { headline: "H2", summary: "S2" }],
      ])
    );

    const updated = await fillMissingHeadlines(client, generateFn);

    expect(generateFn).toHaveBeenCalledTimes(1);
    expect(generateFn.mock.calls[0][0]).toHaveLength(2);
    expect(updated).toBe(2);
  });

  it("saves the classified topic alongside the headline and summary", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: [{ id: "story-1" }], error: null };
      }
      if (q.table === "articles") {
        return { data: [{ title: "T", outlet: { name: "Outlet" } }], error: null };
      }
      if (q.table === "stories" && has(q.calls, "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const generateFn = jest
      .fn()
      .mockResolvedValue(new Map([["story-1", { headline: "H1", summary: "S1", topic: "politics" }]]));

    const updated = await fillMissingHeadlines(client, generateFn);

    expect(updated).toBe(1);
    const updateQuery = queries.find((q) => q.table === "stories" && has(q.calls, "update"));
    const updateCall = updateQuery!.calls.find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual(expect.objectContaining({ topic: "politics" }));
  });

  it("returns 0 and does not throw when the batch call fails (quota exhaustion is normal)", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: [{ id: "story-1" }], error: null };
      }
      if (q.table === "articles") {
        return { data: [{ title: "T", outlet: { name: "Outlet" } }], error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const generateFn = jest.fn().mockRejectedValue(new Error("429 quota"));

    const updated = await fillMissingHeadlines(client, generateFn);

    expect(updated).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith("Failed to generate batch headlines:", "429 quota");
    errorSpy.mockRestore();
  });

  it("skips a story the batch response didn't include a headline for, but saves the rest", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: [{ id: "story-1" }, { id: "story-2" }], error: null };
      }
      if (q.table === "articles") {
        return { data: [{ title: "T", outlet: { name: "Outlet" } }], error: null };
      }
      if (q.table === "stories" && has(q.calls, "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const generateFn = jest
      .fn()
      .mockResolvedValue(new Map([["story-1", { headline: "H1", summary: "S1" }]]));

    const updated = await fillMissingHeadlines(client, generateFn);

    expect(updated).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("did not include a headline for story story-2")
    );
    errorSpy.mockRestore();
  });

  it("skips a story with no articles and never calls the batch fn for it", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: [{ id: "story-1" }], error: null };
      }
      if (q.table === "articles") {
        return { data: [], error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const generateFn = jest.fn();

    const updated = await fillMissingHeadlines(client, generateFn);

    expect(updated).toBe(0);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("returns 0 without calling the batch fn when no stories need headlines", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories") return { data: [], error: null };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const generateFn = jest.fn();

    const updated = await fillMissingHeadlines(client, generateFn);

    expect(updated).toBe(0);
    expect(generateFn).not.toHaveBeenCalled();
  });
});
