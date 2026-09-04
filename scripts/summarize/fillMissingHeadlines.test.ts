import { fillMissingHeadlines } from "./fillMissingHeadlines";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "update", "is", "eq", "in", "order", "limit"];

function has(calls: Call[], method: string): boolean {
  return calls.some((c) => c.method === method);
}

/** Fans a fixed per-story article template out across every requested id. */
function articlesRowsFor(q: Query, template: { title: string; outlet: { name: string } }[]) {
  const ids: string[] = q.calls.find((c) => c.method === "in")?.args[1] ?? [];
  const rows: any[] = [];
  for (const id of ids) for (const a of template) rows.push({ story_id: id, ...a });
  return rows;
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
        return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
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

  it("issues multiple batch calls when more stories need headlines than one batch holds", async () => {
    const storyIds = Array.from({ length: 45 }, (_, i) => ({ id: `story-${i}` }));
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: storyIds, error: null };
      }
      if (q.table === "articles") {
        return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
      }
      if (q.table === "stories" && has(q.calls, "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const generateFn = jest.fn().mockImplementation(async (chunk: { id: string }[]) => {
      const map = new Map();
      for (const s of chunk) map.set(s.id, { headline: "H", summary: "S" });
      return map;
    });

    const updated = await fillMissingHeadlines(client, generateFn, jest.fn().mockResolvedValue(undefined));

    // 45 stories over a batch size of 20 -> 3 calls (20, 20, 5), not 1.
    expect(generateFn).toHaveBeenCalledTimes(3);
    expect(generateFn.mock.calls[0][0]).toHaveLength(20);
    expect(generateFn.mock.calls[1][0]).toHaveLength(20);
    expect(generateFn.mock.calls[2][0]).toHaveLength(5);
    expect(updated).toBe(45);
  });

  it("stops issuing further batches once one fails, keeping earlier successes", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const storyIds = Array.from({ length: 45 }, (_, i) => ({ id: `story-${i}` }));
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: storyIds, error: null };
      }
      if (q.table === "articles") {
        return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
      }
      if (q.table === "stories" && has(q.calls, "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    let call = 0;
    const generateFn = jest.fn().mockImplementation(async (chunk: { id: string }[]) => {
      call += 1;
      if (call === 2) throw new Error("429 quota");
      const map = new Map();
      for (const s of chunk) map.set(s.id, { headline: "H", summary: "S" });
      return map;
    });

    const updated = await fillMissingHeadlines(client, generateFn, jest.fn().mockResolvedValue(undefined));

    expect(generateFn).toHaveBeenCalledTimes(2); // does not attempt the 3rd chunk
    expect(updated).toBe(20); // only the first chunk's 20 stories were saved
    errorSpy.mockRestore();
  });

  it("spaces out sequential batch requests to stay under the per-minute rate limit", async () => {
    const storyIds = Array.from({ length: 45 }, (_, i) => ({ id: `story-${i}` }));
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: storyIds, error: null };
      }
      if (q.table === "articles") {
        return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
      }
      if (q.table === "stories" && has(q.calls, "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const generateFn = jest.fn().mockImplementation(async (chunk: { id: string }[]) => {
      const map = new Map();
      for (const s of chunk) map.set(s.id, { headline: "H", summary: "S" });
      return map;
    });
    const sleepFn = jest.fn().mockResolvedValue(undefined);

    await fillMissingHeadlines(client, generateFn, sleepFn);

    // 3 batch calls -> 2 gaps between them; no sleep before the first call.
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(expect.any(Number));
    // generateFn must not be invoked again before the sleep before it resolves.
    const sleepOrder = sleepFn.mock.invocationCallOrder;
    const generateOrder = generateFn.mock.invocationCallOrder;
    expect(sleepOrder[0]).toBeGreaterThan(generateOrder[0]);
    expect(sleepOrder[0]).toBeLessThan(generateOrder[1]);
    expect(sleepOrder[1]).toBeGreaterThan(generateOrder[1]);
    expect(sleepOrder[1]).toBeLessThan(generateOrder[2]);
  });

  it("saves the classified topic alongside the headline and summary", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: [{ id: "story-1" }], error: null };
      }
      if (q.table === "articles") {
        return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
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
        return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
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
        return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
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
