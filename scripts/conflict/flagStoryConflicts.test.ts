import { flagStoryConflicts } from "./flagStoryConflicts";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "upsert", "gte", "eq"];

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

describe("flagStoryConflicts", () => {
  it("writes a conflict flag when a covering outlet's owner is mentioned in the story", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "stories") return { data: [{ id: "story-1" }], error: null };
      if (q.table === "articles") {
        return {
          data: [
            {
              title: "Reliance Jio announces new tariff plans",
              snippet: "s",
              outlet: {
                id: "outlet-1",
                ownership: { owner: "Reliance Industries", owner_aliases: ["Reliance", "Jio"] },
              },
            },
          ],
          error: null,
        };
      }
      if (q.table === "story_conflict_flags") return { data: null, error: null };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const flagged = await flagStoryConflicts(client);

    expect(flagged).toBe(1);
    const upsertQuery = queries.find((q) => q.table === "story_conflict_flags")!;
    const payload = upsertQuery.calls.find((c) => c.method === "upsert")!.args[0];
    expect(payload).toEqual([
      {
        story_id: "story-1",
        outlet_id: "outlet-1",
        matched_entity: "Reliance",
        evidence_text: expect.stringContaining("Reliance Jio"),
      },
    ]);
  });

  it("skips a story with no conflicts, writing nothing", async () => {
    const { client, queries } = makeMockSupabase((q) => {
      if (q.table === "stories") return { data: [{ id: "story-1" }], error: null };
      if (q.table === "articles") {
        return {
          data: [{ title: "Farm bill repealed", snippet: "s", outlet: { id: "outlet-1", ownership: null } }],
          error: null,
        };
      }
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const flagged = await flagStoryConflicts(client);

    expect(flagged).toBe(0);
    expect(queries.some((q) => q.table === "story_conflict_flags")).toBe(false);
  });

  it("skips a story with no articles", async () => {
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories") return { data: [{ id: "story-1" }], error: null };
      if (q.table === "articles") return { data: [], error: null };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const flagged = await flagStoryConflicts(client);
    expect(flagged).toBe(0);
  });

  it("logs and continues when the upsert fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeMockSupabase((q) => {
      if (q.table === "stories") return { data: [{ id: "story-1" }], error: null };
      if (q.table === "articles") {
        return {
          data: [
            {
              title: "Adani Group wins new port contract",
              snippet: "s",
              outlet: { id: "outlet-1", ownership: { owner: "Adani Group" } },
            },
          ],
          error: null,
        };
      }
      if (q.table === "story_conflict_flags") return { data: null, error: { message: "write denied" } };
      throw new Error(`unexpected query: ${JSON.stringify(q)}`);
    });

    const flagged = await flagStoryConflicts(client);

    expect(flagged).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("write denied"));
    errorSpy.mockRestore();
  });
});
