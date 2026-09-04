import { planRemerges, RemergeStory } from "./remergeStories";

// cosine([1,0]) vs [0.82,0.5724] = 0.82 (mid band); vs [0,1] = 0.
const A_EMBEDDING = [1, 0];
const MID_MATCH_EMBEDDING = [0.82, 0.5724]; // cosine vs A_EMBEDDING = 0.82
const UNRELATED_EMBEDDING = [0, 1]; // cosine vs A_EMBEDDING = 0
const BELOW_MID_EMBEDDING = [0.7, 0.7141]; // cosine vs A_EMBEDDING ~= 0.70

function story(overrides: Partial<RemergeStory>): RemergeStory {
  return {
    storyId: "story-x",
    founderArticleId: "article-x",
    createdAt: "2026-08-01T00:00:00Z",
    embedding: A_EMBEDDING,
    entityKeys: ["zorblex"],
    articleCount: 1,
    ...overrides,
  };
}

describe("planRemerges", () => {
  it("merges two single-source candidates that share an entity key and are in the mid cosine band, earliest wins", () => {
    const earlier = story({
      storyId: "story-earlier",
      founderArticleId: "art-earlier",
      createdAt: "2026-08-01T00:00:00Z",
      embedding: A_EMBEDDING,
    });
    const later = story({
      storyId: "story-later",
      founderArticleId: "art-later",
      createdAt: "2026-08-05T00:00:00Z",
      embedding: MID_MATCH_EMBEDDING,
    });

    const decisions = planRemerges([earlier, later], [earlier, later]);

    expect(decisions).toEqual([
      {
        loserStoryId: "story-later",
        loserArticleId: "art-later",
        winnerStoryId: "story-earlier",
        cosine: expect.closeTo(0.82, 2),
      },
    ]);
  });

  it("reassigns a single-source candidate into an existing multi-source story regardless of createdAt", () => {
    const candidate = story({
      storyId: "story-candidate",
      founderArticleId: "art-candidate",
      createdAt: "2026-08-20T00:00:00Z", // later than the multi-source story
      embedding: MID_MATCH_EMBEDDING,
    });
    const multiSource = story({
      storyId: "story-multi",
      founderArticleId: "art-multi-founder",
      createdAt: "2026-08-01T00:00:00Z",
      embedding: A_EMBEDDING,
      articleCount: 5,
    });

    const decisions = planRemerges([candidate], [candidate, multiSource]);

    expect(decisions).toEqual([
      {
        loserStoryId: "story-candidate",
        loserArticleId: "art-candidate",
        winnerStoryId: "story-multi",
        cosine: expect.closeTo(0.82, 2),
      },
    ]);
  });

  it("does not merge when no entity key is shared, even at high cosine", () => {
    const a = story({ storyId: "story-a", founderArticleId: "art-a", entityKeys: ["zorblex"] });
    const b = story({
      storyId: "story-b",
      founderArticleId: "art-b",
      embedding: A_EMBEDDING, // cosine 1.0
      entityKeys: ["unrelated-topic"],
    });

    const decisions = planRemerges([a, b], [a, b]);
    expect(decisions).toEqual([]);
  });

  it("does not merge when cosine is below the mid threshold, even with a shared entity key", () => {
    const a = story({ storyId: "story-a", founderArticleId: "art-a" });
    const b = story({
      storyId: "story-b",
      founderArticleId: "art-b",
      embedding: BELOW_MID_EMBEDDING,
    });

    const decisions = planRemerges([a, b], [a, b]);
    expect(decisions).toEqual([]);
  });

  it("does not match a candidate against an unrelated story it merely co-occurs with in the pool", () => {
    const a = story({ storyId: "story-a", founderArticleId: "art-a" });
    const unrelated = story({
      storyId: "story-unrelated",
      founderArticleId: "art-unrelated",
      embedding: UNRELATED_EMBEDDING,
      entityKeys: ["something-else"],
    });

    const decisions = planRemerges([a], [a, unrelated]);
    expect(decisions).toEqual([]);
  });

  it("chains three mutually-similar single-source candidates into one surviving story", () => {
    const earliest = story({
      storyId: "story-1",
      founderArticleId: "art-1",
      createdAt: "2026-08-01T00:00:00Z",
      embedding: A_EMBEDDING,
    });
    const middle = story({
      storyId: "story-2",
      founderArticleId: "art-2",
      createdAt: "2026-08-05T00:00:00Z",
      embedding: MID_MATCH_EMBEDDING,
    });
    const last = story({
      storyId: "story-3",
      founderArticleId: "art-3",
      createdAt: "2026-08-10T00:00:00Z",
      embedding: MID_MATCH_EMBEDDING,
    });

    const decisions = planRemerges([earliest, middle, last], [earliest, middle, last]);

    expect(decisions.map((d) => d.winnerStoryId)).toEqual(["story-1", "story-1"]);
    expect(decisions.map((d) => d.loserStoryId).sort()).toEqual(["story-2", "story-3"]);
  });

  it("skips a candidate that was already consumed as a loser earlier in the pass", () => {
    // story-2 loses to story-1 first (processed in createdAt order); when
    // story-2 itself is later visited as a candidate it must be skipped
    // entirely, not re-evaluated as if it were still alive.
    const story1 = story({
      storyId: "story-1",
      founderArticleId: "art-1",
      createdAt: "2026-08-01T00:00:00Z",
      embedding: A_EMBEDDING,
    });
    const story2 = story({
      storyId: "story-2",
      founderArticleId: "art-2",
      createdAt: "2026-08-05T00:00:00Z",
      embedding: MID_MATCH_EMBEDDING,
    });

    const decisions = planRemerges([story1, story2], [story1, story2]);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ winnerStoryId: "story-1", loserStoryId: "story-2" });
  });
});
