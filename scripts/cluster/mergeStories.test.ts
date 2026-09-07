import { mergeStories } from "./mergeStories";

interface Call {
  method: string;
  args: any[];
}
interface Query {
  table: string;
  calls: Call[];
}
const CHAIN_METHODS = ["select", "update", "delete", "in", "eq"];

function has(calls: Call[], method: string): boolean {
  return calls.some((c) => c.method === method);
}

/**
 * Tables keyed by name hold their current rows in-memory so the mock can
 * answer selects, apply updates/deletes, and reflect them in later queries
 * within the same test -- needed here because mergeStories reads a table,
 * decides per-row, then writes back to the same table.
 */
function makeMockSupabase(tables: Record<string, any[]>) {
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
    builder.then = (onFulfilled: any, onRejected: any) => {
      const rows = tables[table] ?? [];
      let result: any;
      if (has(query.calls, "delete")) {
        const inCall = query.calls.find((c) => c.method === "in");
        const eqCall = query.calls.find((c) => c.method === "eq");
        if (inCall) {
          const [col, ids] = inCall.args;
          tables[table] = rows.filter((r) => !ids.includes(r[col]));
        } else if (eqCall) {
          const [col, val] = eqCall.args;
          tables[table] = rows.filter((r) => r[col] !== val);
        }
        result = { data: null, error: null };
      } else if (has(query.calls, "update")) {
        const payload = query.calls.find((c) => c.method === "update")!.args[0];
        const inCall = query.calls.find((c) => c.method === "in");
        const eqCall = query.calls.find((c) => c.method === "eq");
        for (const r of rows) {
          if (inCall && inCall.args[1].includes(r[inCall.args[0]])) Object.assign(r, payload);
          if (eqCall && r[eqCall.args[0]] === eqCall.args[1]) Object.assign(r, payload);
        }
        result = { data: null, error: null };
      } else {
        // select
        const inCall = query.calls.find((c) => c.method === "in");
        const filtered = inCall ? rows.filter((r) => inCall.args[1].includes(r[inCall.args[0]])) : rows;
        result = { data: filtered, error: null };
      }
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return builder;
  });
  return { client: { from } as any, queries, tables };
}

describe("mergeStories", () => {
  it("reassigns articles from all loser stories to the winner", async () => {
    const tables = {
      articles: [
        { id: "a1", story_id: "loser-1" },
        { id: "a2", story_id: "loser-2" },
        { id: "a3", story_id: "winner" },
      ],
      story_conflict_flags: [],
      user_story_views: [],
      outlet_poll_responses: [],
      list_items: [],
      fact_checks: [],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-1", "loser-2"], "winner");

    expect(tables.articles.map((a) => a.story_id)).toEqual(["winner", "winner", "winner"]);
  });

  it("deletes the loser story rows after merging", async () => {
    const tables = {
      articles: [],
      story_conflict_flags: [],
      user_story_views: [],
      outlet_poll_responses: [],
      list_items: [],
      fact_checks: [],
      stories: [{ id: "loser-1" }, { id: "loser-2" }, { id: "winner" }],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-1", "loser-2"], "winner");

    expect((tables as any).stories.map((s: any) => s.id)).toEqual(["winner"]);
  });

  it("reassigns a conflict flag that has no equivalent on the winner", async () => {
    const tables = {
      articles: [],
      story_conflict_flags: [
        { id: "f1", story_id: "loser-1", outlet_id: "o1", matched_entity: "modi" },
      ],
      user_story_views: [],
      outlet_poll_responses: [],
      list_items: [],
      fact_checks: [],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-1"], "winner");

    expect(tables.story_conflict_flags).toEqual([
      { id: "f1", story_id: "winner", outlet_id: "o1", matched_entity: "modi" },
    ]);
  });

  it("deletes a loser conflict flag that duplicates one the winner already has", async () => {
    const tables = {
      articles: [],
      story_conflict_flags: [
        { id: "loser-flag", story_id: "loser-1", outlet_id: "o1", matched_entity: "modi" },
        { id: "winner-flag", story_id: "winner", outlet_id: "o1", matched_entity: "modi" },
      ],
      user_story_views: [],
      outlet_poll_responses: [],
      list_items: [],
      fact_checks: [],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-1"], "winner");

    expect(tables.story_conflict_flags.map((f) => f.id)).toEqual(["winner-flag"]);
  });

  it("deletes duplicates among two losers reassigning to the same winner slot, keeping only one", async () => {
    const tables = {
      articles: [],
      story_conflict_flags: [
        { id: "loser-a-flag", story_id: "loser-a", outlet_id: "o1", matched_entity: "modi" },
        { id: "loser-b-flag", story_id: "loser-b", outlet_id: "o1", matched_entity: "modi" },
      ],
      user_story_views: [],
      outlet_poll_responses: [],
      list_items: [],
      fact_checks: [],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-a", "loser-b"], "winner");

    const survivors = tables.story_conflict_flags.filter((f) => f.story_id === "winner");
    expect(survivors).toHaveLength(1);
  });

  it("reassigns a poll response with no equivalent on the winner, and dedupes one that collides", async () => {
    const tables = {
      articles: [],
      story_conflict_flags: [],
      user_story_views: [],
      outlet_poll_responses: [
        { id: "r1", story_id: "loser-1", user_id: "u1", outlet_id: "o1" },
        { id: "r2", story_id: "loser-1", user_id: "u2", outlet_id: "o1" },
        { id: "r3", story_id: "winner", user_id: "u2", outlet_id: "o1" },
      ],
      list_items: [],
      fact_checks: [],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-1"], "winner");

    expect(tables.outlet_poll_responses.map((r) => r.id).sort()).toEqual(["r1", "r3"]);
    expect(tables.outlet_poll_responses.find((r) => r.id === "r1")!.story_id).toBe("winner");
  });

  it("reassigns a saved list item with no equivalent on the winner, and dedupes one that collides", async () => {
    const tables = {
      articles: [],
      story_conflict_flags: [],
      user_story_views: [],
      outlet_poll_responses: [],
      list_items: [
        { id: "li1", story_id: "loser-1", list_id: "list-a" },
        { id: "li2", story_id: "loser-1", list_id: "list-b" },
        { id: "li3", story_id: "winner", list_id: "list-b" },
      ],
      fact_checks: [],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-1"], "winner");

    expect(tables.list_items.map((r) => r.id).sort()).toEqual(["li1", "li3"]);
  });

  it("reassigns fact_checks.matched_story_id with no dedupe needed", async () => {
    const tables = {
      articles: [],
      story_conflict_flags: [],
      user_story_views: [],
      outlet_poll_responses: [],
      list_items: [],
      fact_checks: [{ id: "fc1", matched_story_id: "loser-1" }],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-1"], "winner");

    expect(tables.fact_checks[0].matched_story_id).toBe("winner");
  });

  it("reassigns discovered_articles.story_id with no dedupe needed", async () => {
    const tables = {
      articles: [],
      story_conflict_flags: [],
      user_story_views: [],
      outlet_poll_responses: [],
      list_items: [],
      fact_checks: [],
      discovered_articles: [{ id: "da1", story_id: "loser-1" }],
    };
    const { client } = makeMockSupabase(tables);

    await mergeStories(client, ["loser-1"], "winner");

    expect((tables as any).discovered_articles[0].story_id).toBe("winner");
  });
});
