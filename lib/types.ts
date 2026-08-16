export interface Story {
  id: string;
  canonical_headline: string | null;
  summary: string | null;
  first_seen_at: string;
}

export interface ArticleWithOutlet {
  id: string;
  title: string;
  url: string;
  published_at: string | null;
  outlet: { id: string; name: string } | null;
}
