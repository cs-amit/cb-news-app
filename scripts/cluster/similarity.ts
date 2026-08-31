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
}

export interface Cluster {
  articleIds: string[];
}

// Greedy single-link clustering: an article joins the first existing
// cluster where it's similar enough to ANY member; otherwise it starts
// a new cluster. "Similar enough" is now two-tiered: cosine >= highThreshold
// merges unconditionally, but cosine in [midThreshold, highThreshold) only
// merges when the pair also shares at least one entity key — this catches
// same-event coverage that embeds a bit lower (notably cross-language pairs)
// without a blanket threshold drop's false-merge risk.
export function clusterBySimilarity(
  articles: EmbeddedArticle[],
  highThreshold: number,
  midThreshold: number
): Cluster[] {
  const clusters: EmbeddedArticle[][] = [];

  for (const article of articles) {
    let placed = false;
    for (const cluster of clusters) {
      const matches = cluster.some((existing) => {
        const sim = cosineSimilarity(existing.embedding, article.embedding);
        if (sim >= highThreshold) return true;
        return sim >= midThreshold && overlapCount(existing.entityKeys, article.entityKeys) >= 1;
      });
      if (matches) {
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
