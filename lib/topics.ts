export const TOPICS_ALL = [
  "politics",
  "business",
  "science-tech",
  "sports",
  "entertainment",
  "other",
] as const;
export type Topic = (typeof TOPICS_ALL)[number];
export const TOPIC_LABELS: Record<Topic, string> = {
  politics: "Politics",
  business: "Business",
  "science-tech": "Science & tech",
  sports: "Sports",
  entertainment: "Entertainment",
  other: "Other",
};
