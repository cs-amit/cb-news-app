const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

export async function embedText(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    }),
  });
  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) {
    throw new Error("Embedding response missing values array");
  }
  return values;
}
