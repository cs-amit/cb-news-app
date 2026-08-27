import { isValidHandle } from "./handle";

describe("isValidHandle", () => {
  it("accepts lowercase letters, digits, and underscore within length bounds", () => {
    expect(isValidHandle("amit_57")).toBe(true);
    expect(isValidHandle("abc")).toBe(true);
    expect(isValidHandle("a".repeat(20))).toBe(true);
  });

  it("rejects too short or too long handles", () => {
    expect(isValidHandle("ab")).toBe(false);
    expect(isValidHandle("a".repeat(21))).toBe(false);
  });

  it("rejects uppercase, spaces, and symbols other than underscore", () => {
    expect(isValidHandle("Amit57")).toBe(false);
    expect(isValidHandle("amit 57")).toBe(false);
    expect(isValidHandle("amit-57")).toBe(false);
    expect(isValidHandle("amit@57")).toBe(false);
  });
});
