import { scoreOutlets } from "./scoreOutlets";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "update", "eq", "order", "limit"];

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

describe("scoreOutlets", () => {
  it("skips outlets with fewer than 5 sampled articles and scores the rest in one call", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "outlets" && q.calls.some((c) => c.method === "select")) {
        return { data: [{ id: "outlet-1", name: "A" }, { id: "outlet-2", name: "B" }], error: null };
      }
      if (q.table === "articles") {
        const outletId = q.calls.find((c) => c.method === "eq")!.args[1];
        if (outletId === "outlet-1") {
          return { data: Array.from({ length: 6 }, (_, i) => ({ title: `T${i}` })), error: null };
        }
        return { data: [{ title: "only one" }], error: null }; // outlet-2: below MIN_SAMPLE_SIZE
      }
      if (q.table === "outlets" && q.calls.some((c) => c.method === "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const scoreFn = jest
      .fn()
      .mockResolvedValue(new Map([["outlet-1", { govtLeanScore: 40, sensationalismScore: 10 }]]));

    const scored = await scoreOutlets(client, scoreFn);

    expect(scoreFn).toHaveBeenCalledTimes(1);
    expect(scoreFn.mock.calls[0][0]).toEqual([{ id: "outlet-1", name: "A", titles: expect.any(Array) }]);
    expect(scored).toBe(1);
  });

  it("returns 0 and does not throw when the batch call fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeMockSupabase((q) => {
      if (q.table === "outlets" && q.calls.some((c) => c.method === "select")) {
        return { data: [{ id: "outlet-1", name: "A" }], error: null };
      }
      if (q.table === "articles") {
        return { data: Array.from({ length: 5 }, (_, i) => ({ title: `T${i}` })), error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const scoreFn = jest.fn().mockRejectedValue(new Error("429 quota"));

    const scored = await scoreOutlets(client, scoreFn);

    expect(scored).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith("Failed to generate outlet scores:", "429 quota");
    errorSpy.mockRestore();
  });

  it("returns 0 without calling the batch fn when no outlet has enough sample articles", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "outlets" && q.calls.some((c) => c.method === "select")) {
        return { data: [{ id: "outlet-1", name: "A" }], error: null };
      }
      if (q.table === "articles") return { data: [{ title: "only one" }], error: null };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const scoreFn = jest.fn();

    const scored = await scoreOutlets(client, scoreFn);

    expect(scored).toBe(0);
    expect(scoreFn).not.toHaveBeenCalled();
  });
});
