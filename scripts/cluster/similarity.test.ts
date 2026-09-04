import { cosineSimilarity, clusterBySimilarity, overlapCount } from "./similarity";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("throws when vectors have different lengths", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow("Vectors must be the same length");
  });
});

describe("overlapCount", () => {
  it("counts unique shared keys, ignoring duplicates within a side", () => {
    expect(overlapCount(["up", "60", "up"], ["up", "women"])).toBe(1);
  });

  it("returns 0 when there is no overlap", () => {
    expect(overlapCount(["a"], ["b"])).toBe(0);
  });

  it("returns 0 for empty inputs", () => {
    expect(overlapCount([], ["a"])).toBe(0);
  });
});

describe("clusterBySimilarity", () => {
  it("groups near-identical embeddings into one cluster (high-threshold path)", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: [] },
      { id: "b", embedding: [0.99, 0.01], entityKeys: [] },
      { id: "c", embedding: [0, 1], entityKeys: [] },
    ];
    const clusters = clusterBySimilarity(articles, 0.9, 0.9);
    expect(clusters).toHaveLength(2);
    const clusterWithA = clusters.find((c) => c.articleIds.includes("a"));
    expect(clusterWithA?.articleIds.sort()).toEqual(["a", "b"]);
  });

  it("puts every article in its own cluster when nothing meets either threshold", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: [] },
      { id: "b", embedding: [0, 1], entityKeys: [] },
    ];
    const clusters = clusterBySimilarity(articles, 0.99, 0.99);
    expect(clusters).toHaveLength(2);
  });

  it("returns an empty array for no articles", () => {
    expect(clusterBySimilarity([], 0.9, 0.9)).toEqual([]);
  });

  it("merges below the high threshold when entity keys overlap", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: ["up", "60"] },
      { id: "b", embedding: [0.8, 0.6], entityKeys: ["up", "women"] }, // cosine 0.8
    ];
    const clusters = clusterBySimilarity(articles, 0.9, 0.75);
    expect(clusters).toHaveLength(1);
  });

  it("does not merge below the high threshold without entity overlap", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: ["delhi"] },
      { id: "b", embedding: [0.8, 0.6], entityKeys: ["mumbai"] }, // cosine 0.8, no shared entities
    ];
    const clusters = clusterBySimilarity(articles, 0.9, 0.75);
    expect(clusters).toHaveLength(2);
  });

  it("does not merge on entity overlap alone when cosine is below the mid threshold", () => {
    const articles = [
      { id: "a", embedding: [1, 0], entityKeys: ["up", "60"] },
      { id: "b", embedding: [0, 1], entityKeys: ["up", "60"] }, // cosine 0
    ];
    const clusters = clusterBySimilarity(articles, 0.9, 0.75);
    expect(clusters).toHaveLength(2);
  });

  // Regression fixtures for the supercluster drift bug: the mid-threshold+entity
  // path used to check a new article against ANY current cluster member, so a
  // chain of articles that each shared a generic recurring entity (a person's
  // name, an exam acronym, a city) with some prior member could drift
  // arbitrarily far from the cluster's founding topic. The fix compares only
  // against cluster[0].

  it("does not chain Bhagwat's NY speech into his separate later Toronto trip via a bridging article", () => {
    // "bridge" sits in the mid-threshold+entity band relative to the founder
    // "ny" (cosine 0.82, shares "bhagwat"), so it merges normally. "toronto"
    // is far from the founder (cosine 0.37, below midThreshold) but is in the
    // mid-threshold+entity band relative to "bridge" (cosine 0.84, shares
    // "bhagwat") — under the old any-member rule that was enough to merge it.
    const articles = [
      { id: "ny", embedding: [1, 0], entityKeys: ["bhagwat", "new-york"] },
      { id: "bridge", embedding: [0.82, 0.5724], entityKeys: ["bhagwat"] }, // cosine vs ny: 0.82
      {
        id: "toronto",
        embedding: [0.3746, 0.9272],
        entityKeys: ["bhagwat", "toronto"],
      }, // cosine vs ny: 0.37, vs bridge: 0.84
    ];
    const clusters = clusterBySimilarity(articles, 0.86, 0.78);
    const clusterWithNy = clusters.find((c) => c.articleIds.includes("ny"));
    expect(clusterWithNy?.articleIds).not.toContain("toronto");
  });

  it("still merges the full NEET-PG Jaipur core cluster via shared entity keys", () => {
    const founder = { id: "core-0", embedding: [1, 0], entityKeys: ["neet", "pg", "jaipur"] };
    const members = Array.from({ length: 17 }, (_, i) => ({
      id: `core-${i + 1}`,
      embedding: [0.82, 0.5724], // cosine vs founder: 0.82
      entityKeys: ["neet", "pg", "jaipur"],
    }));
    const articles = [founder, ...members];
    const clusters = clusterBySimilarity(articles, 0.86, 0.78);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].articleIds).toHaveLength(18);
  });

  it("does not let unrelated Gwalior/Telangana/AIIMS articles join the NEET-PG Jaipur cluster", () => {
    const founder = { id: "core-0", embedding: [1, 0], entityKeys: ["neet", "pg", "jaipur"] };
    const core = { id: "core-1", embedding: [0.82, 0.5724], entityKeys: ["neet", "pg", "jaipur"] }; // cosine vs founder: 0.82
    const unrelated = [
      { id: "gwalior", embedding: [0.3, 0.9539], entityKeys: ["neet", "gwalior"] }, // cosine vs founder: 0.3
      { id: "telangana", embedding: [0.35, 0.9368], entityKeys: ["pg", "telangana"] }, // cosine vs founder: 0.35
      { id: "aiims", embedding: [0.32, 0.9475], entityKeys: ["jaipur", "aiims"] }, // cosine vs founder: 0.32
    ];
    const articles = [founder, core, ...unrelated];
    const clusters = clusterBySimilarity(articles, 0.86, 0.78);
    const jaipurCluster = clusters.find((c) => c.articleIds.includes("core-0"));
    expect(jaipurCluster?.articleIds.sort()).toEqual(["core-0", "core-1"]);
  });

  it("still merges a continuous-incident cluster where every article is close to the founder", () => {
    const founder = { id: "inc-0", embedding: [1, 0], entityKeys: ["baliyan"] };
    const members = Array.from({ length: 25 }, (_, i) => ({
      id: `inc-${i + 1}`,
      embedding: [0.82, 0.5724], // cosine vs founder: 0.82
      entityKeys: ["baliyan"],
    }));
    const articles = [founder, ...members];
    const clusters = clusterBySimilarity(articles, 0.86, 0.78);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].articleIds).toHaveLength(26);
  });

  // Regression fixtures for the "zombie anchor" bug: cluster[0] is positional
  // (whichever article array order happens to place first), which for a
  // long-running story is often the most recently merged article, not the
  // true founder. A `founderEmbedding`/`founderEntityKeys` override lets the
  // caller (clusterStories.ts) tell the mid-threshold path what the real
  // founder looked like, regardless of cluster[0]'s own (possibly drifted) data.

  it("uses the founder override, not cluster[0]'s own data, to ALLOW a mid-threshold merge", () => {
    const zombieAnchor = {
      id: "zombie",
      embedding: [0, 1], // cosine vs candidate: 0.57 — below midThreshold on its own
      entityKeys: ["driftedTopic"],
      founderEmbedding: [1, 0], // cosine vs candidate: 0.82 — within mid band
      founderEntityKeys: ["trueFounder"],
    };
    const candidate = {
      id: "candidate",
      embedding: [0.82, 0.5724],
      entityKeys: ["trueFounder"], // overlaps the founder override, not zombie's own keys
    };
    const clusters = clusterBySimilarity([zombieAnchor, candidate], 0.86, 0.78);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].articleIds.sort()).toEqual(["candidate", "zombie"]);
  });

  it("uses the founder override, not cluster[0]'s own data, to BLOCK a mid-threshold merge", () => {
    const zombieAnchor = {
      id: "zombie",
      embedding: [1, 0], // cosine vs candidate: 0.82 — would match on its own
      entityKeys: ["matchingKey"],
      founderEmbedding: [0, 1], // cosine vs candidate: 0.57 — below midThreshold
      founderEntityKeys: ["differentKey"],
    };
    const candidate = {
      id: "candidate",
      embedding: [0.82, 0.5724],
      entityKeys: ["matchingKey"],
    };
    const clusters = clusterBySimilarity([zombieAnchor, candidate], 0.86, 0.78);
    expect(clusters).toHaveLength(2);
  });
});
