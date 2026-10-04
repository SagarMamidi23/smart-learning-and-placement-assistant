import { citedNumbers, normalizeCitations } from "./mentor";

describe("citations", () => {
  it("finds cited excerpt numbers, ignoring ones that do not exist", () => {
    expect(citedNumbers("A [1] and B [3] and again [1], but [9] is invented.", 3)).toEqual([1, 3]);
    expect(citedNumbers("No citations here.", 3)).toEqual([]);
    expect(citedNumbers("Zero [0] is not a source.", 3)).toEqual([]);
  });

  it("understands full-width brackets some models produce", () => {
    expect(citedNumbers("Entropy rises【2】 and falls [1].", 2)).toEqual([1, 2]);
  });

  it("normalises full-width brackets to plain ones", () => {
    expect(normalizeCitations("Heat flows【1】 then stops【2】.")).toBe(
      "Heat flows[1] then stops[2].",
    );
    expect(normalizeCitations("Already [1] fine.")).toBe("Already [1] fine.");
  });
});
