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
});
