import { chunk } from "./chunk";

describe("chunk", () => {
  it("splits an array into groups of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk when the array is smaller than the size", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("returns an empty array for an empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("returns exact-size groups with no trailing empty chunk when evenly divisible", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});
