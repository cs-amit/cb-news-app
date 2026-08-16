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

export interface EmbeddedArticle {
  id: string;
  embedding: number[];
}

export interface Cluster {
  articleIds: string[];
}

// Greedy single-link clustering: an article joins the first existing
// cluster where it's similar enough to ANY member; otherwise it starts
// a new cluster.
export function clusterBySimilarity(
  articles: EmbeddedArticle[],
  threshold: number
): Cluster[] {
  const clusters: { articleIds: string[]; embeddings: number[][] }[] = [];

  for (const article of articles) {
    let placed = false;
    for (const cluster of clusters) {
      const matches = cluster.embeddings.some(
        (existing) => cosineSimilarity(existing, article.embedding) >= threshold
      );
      if (matches) {
        cluster.articleIds.push(article.id);
        cluster.embeddings.push(article.embedding);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ articleIds: [article.id], embeddings: [article.embedding] });
    }
  }

  return clusters.map((c) => ({ articleIds: c.articleIds }));
}
