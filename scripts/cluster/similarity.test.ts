import { cosineSimilarity, clusterBySimilarity } from "./similarity";

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

describe("clusterBySimilarity", () => {
  it("groups near-identical embeddings into one cluster", () => {
    const articles = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0.99, 0.01] },
      { id: "c", embedding: [0, 1] },
    ];
    const clusters = clusterBySimilarity(articles, 0.9);
    expect(clusters).toHaveLength(2);
    const clusterWithA = clusters.find((c) => c.articleIds.includes("a"));
    expect(clusterWithA?.articleIds.sort()).toEqual(["a", "b"]);
  });

  it("puts every article in its own cluster when nothing meets the threshold", () => {
    const articles = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0, 1] },
    ];
    const clusters = clusterBySimilarity(articles, 0.99);
    expect(clusters).toHaveLength(2);
  });

  it("returns an empty array for no articles", () => {
    expect(clusterBySimilarity([], 0.9)).toEqual([]);
  });
});
