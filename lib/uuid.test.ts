import { isValidUuid } from "./uuid";

describe("isValidUuid", () => {
  it("accepts a well-formed v4 uuid", () => {
    expect(isValidUuid("8347e399-b7d1-4e8f-89ba-bc3b27388d74")).toBe(true);
  });

  it("accepts uppercase hex", () => {
    expect(isValidUuid("8347E399-B7D1-4E8F-89BA-BC3B27388D74")).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    expect(isValidUuid("nonexistent")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidUuid("")).toBe(false);
  });

  it("rejects a uuid with the wrong segment lengths", () => {
    expect(isValidUuid("8347e399-b7d1-4e8f-89ba-bc3b2738")).toBe(false);
  });
});
