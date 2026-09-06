export interface Story {
  id: string;
  canonical_headline: string | null;
  summary: string | null;
  first_seen_at: string;
  image_url: string | null;
  article_count: number;
}

export interface OutletOwnership {
  owner: string;
  owner_aliases?: string[];
  citation_url?: string;
  note?: string;
  note_citation_url?: string;
}

export interface OutletInfo {
  id: string;
  name: string;
  is_youtube: boolean;
  rss_url: string | null;
  ownership: OutletOwnership | null;
  freedom_score: number | null;
  govt_lean_score: number | null;
  sensationalism_score: number | null;
  govt_lean_sample_size: number | null;
  govt_lean_updated_at: string | null;
}

export interface ArticleWithOutlet {
  id: string;
  title: string;
  url: string;
  published_at: string | null;
  image_url: string | null;
  outlet: OutletInfo | null;
}

export interface ConflictFlag {
  outlet_id: string;
  matched_entity: string;
  evidence_text: string;
}
