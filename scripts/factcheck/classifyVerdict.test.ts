import { classifyVerdict } from "./classifyVerdict";

describe("classifyVerdict", () => {
  it("classifies debunking language as False", () => {
    expect(classifyVerdict("Fact Check: Viral claim about vaccine is FALSE")).toBe("False");
    expect(classifyVerdict("This morphed image is fake, here's the truth")).toBe("False");
  });

  it("classifies misleading language as Misleading", () => {
    expect(classifyVerdict("Old video shared with misleading context")).toBe("Misleading");
  });

  it("classifies confirming language as True", () => {
    expect(classifyVerdict("Yes, this viral claim is true and confirmed")).toBe("True");
  });

  it("falls back to Unverified for ambiguous titles", () => {
    expect(classifyVerdict("A look at this week's viral claims")).toBe("Unverified");
  });
});
