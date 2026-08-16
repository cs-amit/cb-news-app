import { embedText } from "./embed";

describe("embedText", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the embedding values array on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
    }) as any;

    const result = await embedText("hello world", "fake-key");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws when the response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    }) as any;

    await expect(embedText("hello", "fake-key")).rejects.toThrow("Embedding request failed: 429");
  });

  it("throws when the response has no embedding values", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as any;

    await expect(embedText("hello", "fake-key")).rejects.toThrow(
      "Embedding response missing values array"
    );
  });
});
