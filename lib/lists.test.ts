import { computeReorderedPositions } from "./lists";

describe("computeReorderedPositions", () => {
  const items = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];

  it("moves an item from the front to the back", () => {
    const result = computeReorderedPositions(items, 0, 2);
    expect(result).toEqual([
      { id: "b", position: 0 },
      { id: "c", position: 1 },
      { id: "a", position: 2 },
    ]);
  });

  it("moves an item from the back to the front", () => {
    const result = computeReorderedPositions(items, 2, 0);
    expect(result).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("is a no-op when moved to its own position", () => {
    const result = computeReorderedPositions(items, 1, 1);
    expect(result).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("sorts by existing position first, regardless of input array order", () => {
    const shuffled = [items[2], items[0], items[1]];
    const result = computeReorderedPositions(shuffled, 0, 1);
    expect(result).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
  });
});
