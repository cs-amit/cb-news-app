import { drainHeadlineBacklog } from "./drainHeadlineBacklog";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "update", "is", "eq", "in", "lte", "order", "limit"];

function has(calls: Call[], method: string): boolean {
  return calls.some((c) => c.method === method);
}

function articlesRowsFor(q: Query, template: { title: string; outlet: { name: string } }[]) {
  const ids: string[] = q.calls.find((c) => c.method === "in")?.args[1] ?? [];
  const rows: any[] = [];
  for (const id of ids) for (const a of template) rows.push({ story_id: id, ...a });
  return rows;
}

function makeMockSupabase(resolve: (q: Query) => any) {
  const from = jest.fn((table: string) => {
    const query: Query = { table, calls: [] };
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
  return { client: { from } as any };
}

/** A supabase double that hands back `pages[n]` of headline-less story ids on the nth select. */
function makeMockSupabasePaged(pages: { id: string }[][]) {
  let selectCall = 0;
  return makeMockSupabase((q) => {
    if (q.table === "stories" && has(q.calls, "select")) {
      const page = pages[selectCall] ?? [];
      selectCall += 1;
      return { data: page, error: null };
    }
    if (q.table === "articles") {
      return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
    }
    if (q.table === "stories" && has(q.calls, "update")) {
      return { data: null, error: null };
    }
    throw new Error(`unexpected query: ${JSON.stringify(q)}`);
  });
}

function makeGenerateFn() {
  return jest.fn().mockImplementation(async (chunk: { id: string }[]) => {
    const map = new Map();
    for (const s of chunk) map.set(s.id, { headline: "H", summary: "S" });
    return map;
  });
}

describe("drainHeadlineBacklog", () => {
  it("keeps calling fillMissingHeadlines until a call returns no stories, summing the total", async () => {
    const { client } = makeMockSupabasePaged([
      [{ id: "story-1" }, { id: "story-2" }],
      [{ id: "story-3" }],
      [],
    ]);
    const generateFn = makeGenerateFn();

    const result = await drainHeadlineBacklog(client, generateFn, jest.fn().mockResolvedValue(undefined));

    expect(result.totalHeadlined).toBe(3);
    expect(result.iterations).toBe(3);
  });

  it("returns immediately with 0 when the backlog is already empty", async () => {
    const { client } = makeMockSupabasePaged([[]]);
    const generateFn = makeGenerateFn();

    const result = await drainHeadlineBacklog(client, generateFn, jest.fn().mockResolvedValue(undefined));

    expect(result.totalHeadlined).toBe(0);
    expect(result.iterations).toBe(1);
  });

  it("sleeps between successive iterations but not before the first", async () => {
    const { client } = makeMockSupabasePaged([[{ id: "story-1" }], [{ id: "story-2" }], []]);
    const generateFn = makeGenerateFn();
    const sleepFn = jest.fn().mockResolvedValue(undefined);

    await drainHeadlineBacklog(client, generateFn, sleepFn, 7000);

    // 3 iterations -> 2 gaps between them.
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(7000);
  });

  it("stops at the safety ceiling instead of looping forever, and warns", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // Every page is non-empty: without a ceiling this would never terminate.
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories" && has(q.calls, "select")) {
        return { data: [{ id: "story-x" }], error: null };
      }
      if (q.table === "articles") {
        return { data: articlesRowsFor(q, [{ title: "T", outlet: { name: "Outlet" } }]), error: null };
      }
      if (q.table === "stories" && has(q.calls, "update")) {
        return { data: null, error: null };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });
    const generateFn = makeGenerateFn();

    const result = await drainHeadlineBacklog(
      client,
      generateFn,
      jest.fn().mockResolvedValue(undefined),
      0,
      5 // maxIterations
    );

    expect(result.iterations).toBe(5);
    expect(result.totalHeadlined).toBe(5);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("safety ceiling"));
    warnSpy.mockRestore();
  });
});
