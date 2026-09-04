export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must be the same length");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Size of the unique intersection of two entity-key sets. */
export function overlapCount(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let count = 0;
  for (const key of setA) {
    if (setB.has(key)) count += 1;
  }
  return count;
}

export interface EmbeddedArticle {
  id: string;
  embedding: number[];
  entityKeys: string[];
  /**
   * When set, the mid-threshold+entity path uses this instead of the
   * article's own embedding/entityKeys when the article is being compared
   * against as cluster[0]. Lets the caller pin comparisons to a story's true
   * founding article instead of whichever member happens to land first —
   * cluster[0] is otherwise positional (array order), and for a long-running
   * story that's often just the most recently merged article, not the
   * original one ("zombie anchor" drift).
   */
  founderEmbedding?: number[];
  founderEntityKeys?: string[];
}

export interface Cluster {
  articleIds: string[];
}

// Greedy single-link clustering: an article joins the first existing
// cluster where it's similar enough; otherwise it starts a new cluster.
// "Similar enough" is two-tiered: cosine >= highThreshold merges
// unconditionally against ANY cluster member (direct topical match is a
// strong enough signal that drift isn't a concern). Cosine in
// [midThreshold, highThreshold) only merges when the pair also shares an
// entity key, and only against the cluster's founding member (cluster[0])
// — checking this weaker signal against any member let a chain of articles
// each sharing a generic recurring entity (a person's name, an exam
// acronym, a city) with some prior member drift arbitrarily far from the
// cluster's original topic. Note: for anchor-seeded clusters cluster[0] is
// whichever anchor sorts first, not necessarily the true founder — still a
// meaningfully tighter bound than "any member".
export function clusterBySimilarity(
  articles: EmbeddedArticle[],
  highThreshold: number,
  midThreshold: number
): Cluster[] {
  const clusters: EmbeddedArticle[][] = [];

  for (const article of articles) {
    let placed = false;
    for (const cluster of clusters) {
      const founder = cluster[0];
      const matchesHigh = cluster.some(
        (existing) => cosineSimilarity(existing.embedding, article.embedding) >= highThreshold
      );
      const founderEmbedding = founder.founderEmbedding ?? founder.embedding;
      const founderEntityKeys = founder.founderEntityKeys ?? founder.entityKeys;
      const matchesMid =
        cosineSimilarity(founderEmbedding, article.embedding) >= midThreshold &&
        overlapCount(founderEntityKeys, article.entityKeys) >= 1;
      if (matchesHigh || matchesMid) {
        cluster.push(article);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push([article]);
    }
  }

  return clusters.map((c) => ({ articleIds: c.map((a) => a.id) }));
}
